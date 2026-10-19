/**
 * The binary is a shell over the plan API (SDD-22 §3.2). This module owns exactly three
 * things: argv → command, command → plan, plan → (print | apply). Exit codes:
 *
 *   0  success
 *   1  usage error, a collision without --force, or a command of the plan that failed
 *   2  a compiler diagnostic on a file the CLI was asked to modify (--in), or a file
 *      `fudic fmt` was asked to format and could not read
 *
 * It never throws: an unexpected error becomes an exit code, because a Node stack trace in
 * the terminal is a failure of the CLI (SDD-22 §5).
 */

import { parseArgs } from './args.js';
import { commandHelp } from './help/commands.js';
import { GENERAL_HELP } from './help/general.js';
import { formatUsageError } from './help/usage.js';
import { apply } from './apply.js';
import type { FudCode } from '@fudic/diagnostics';
import { commandFailed } from './diagnostics.js';
import { absolute } from './paths.js';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CheckKind, CheckPlan } from './plans/check.js';
import { duration, nodeServeDeps, serveWorkspace, type ServeDeps } from './serve/workspace.js';
import { formatDiff, formatError, formatDiagnostic, formatPlan, planToJson } from './report.js';
import { nodeCommandRunner, nodeReadIo, nodeWriteIo, type CommandRunner, type ReadIo, type WriteIo } from './io.js';
import type { Plan, TranslatePlan } from './types.js';

/**
 * The errors that mean "a source file could not be read", which is exit code 2: `--in` that
 * does not parse, and a file `fudic fmt` could not parse. A code-keyed lookup (SDD-50).
 */
const BROKEN_SOURCE: ReadonlySet<FudCode> = new Set<FudCode>(['FUD0445', 'FUD0450']);

/** Output seam: tests capture, the binary writes to the real streams. */
export interface Streams {
  out(text: string): void;
  err(text: string): void;
}

export interface RunDeps {
  readonly readIo: ReadIo;
  readonly writeIo: WriteIo;
  readonly runner: CommandRunner;
  readonly streams: Streams;
  /** What `fudic dev` and `fudic preview` start: processes, ports, a server. */
  readonly serve?: ServeDeps;
  /** Milliseconds, for the times `fudic test` and `fudic spec` say. `Date.now` when absent. */
  readonly clock?: () => number;
  /** Where the vitest a project installed is (its `dist/node.js`); the real lookup when absent. */
  readonly vitestOf?: (dir: string) => string | undefined;
}

function nodeStreams(): Streams {
  return {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  };
}

export function defaultDeps(): RunDeps {
  return { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner: nodeCommandRunner(), streams: nodeStreams(), serve: nodeServeDeps() };
}

export async function run(argv: readonly string[], deps: RunDeps = defaultDeps()): Promise<number> {
  try {
    return await execute(argv, deps);
  } catch (error) {
    deps.streams.err(`error ${(error as Error).message}\n`);
    return 1;
  }
}

async function execute(argv: readonly string[], deps: RunDeps): Promise<number> {
  const command = parseArgs(argv);
  if (command.kind === 'help') {
    deps.streams.out(command.topic === null ? GENERAL_HELP : commandHelp(command.topic));
    return 0;
  }
  if (command.kind === 'error') {
    deps.streams.err(formatUsageError(command));
    return 1;
  }
  // Not a plan: it runs until it is stopped (BUG-50 §4.5).
  if (command.kind === 'serve') {
    // The machine first: what starts the apps is chosen before anything else is asked.
    const machine = deps.serve ?? nodeServeDeps();
    const { appsToServe } = await import('./serve/apps.js');
    const { apps, errors } = appsToServe(command.serve, command.opts, deps.readIo);
    if (errors.length > 0) {
      for (const error of errors) deps.streams.err(`${formatError(error)}\n`);
      return 1;
    }
    return serveWorkspace(command.serve, apps, command.opts.port, machine);
  }
  const plan = await build(command, deps.readIo);
  const { flags } = command;
  const human = flags.json ? deps.streams.err : deps.streams.out;

  for (const entry of plan.diagnostics) {
    human(`${formatDiagnostic(entry, sourceOf(command.opts.cwd, entry.file, deps.readIo))}\n`);
  }

  if (plan.errors.length > 0) {
    for (const error of plan.errors) human(`${formatError(error)}\n`);
    if (flags.json) deps.streams.out(`${planToJson(plan)}\n`);
    return plan.errors.some((error) => BROKEN_SOURCE.has(error.code)) ? 2 : 1;
  }

  if (flags.json) deps.streams.out(`${planToJson(plan)}\n`);

  // `--check` is the plan read for its size instead of applied: exactly what `--dry-run`
  // computes, with an exit code CI can branch on (SDD-26 §3).
  if (command.kind === 'fmt' && command.opts.check) {
    for (const change of plan.changes) human(`  would format  ${change.path}\n`);
    return plan.changes.length > 0 ? 1 : 0;
  }

  if (flags.dryRun) {
    human(`${['dry run — nothing written', ...formatPlan(plan)].join('\n')}\n`);
    for (const change of plan.changes) {
      if (change.kind === 'modify') human(`${formatDiff(change).join('\n')}\n`);
    }
    return closing(plan, human);
  }

  // `fudic test` / `fudic spec` are not applied like a plan: every project runs even when one
  // fails, and the end says how they went (BUG-51). Errors, `--json` and `--dry-run` are the
  // plan's, above.
  if (command.kind === 'check') return runChecks(command.check, plan as CheckPlan, command.opts.cwd, deps);

  const applied = await apply(plan, command.opts, deps.writeIo, deps.runner);
  // A plan with errors is never applied: nothing was removed either.
  const removed = plan.errors.length > 0 ? [] : (plan.deletions ?? []).map((path) => `  delete  ${path}`);
  // A plan's own report only once everything it says happened did happen: a failed command
  // falls back to the file list, which is still true.
  if (!flags.json && plan.report !== undefined && applied.failed === undefined) {
    if (plan.report.length > 0) human(`${plan.report.join('\n')}\n`);
  }
  else if (!flags.json) human(`${[...applied.changes.map((change) => (change.kind === 'create' ? `  create  ${change.path}` : `  modify  ${change.path}`)), ...removed].join('\n')}\n`);

  // Reported AFTER the changes, because those really did happen: the files are written
  // before the first command runs, and a failure here does not unwrite them. Exit 1, the
  // code of "the CLI could not do what was asked" — not 2, which means a source file the
  // CLI was pointed at could not be read.
  if (applied.failed !== undefined) {
    human(`${formatError(commandFailed(applied.failed))}\n`);
    return 1;
  }
  return closing(plan, human);
}

/** The runner that puts every project in one vitest: `runner/`, beside `src/` and `dist/`. */
const VITEST_PROJECTS = new URL('../runner/vitest-projects.mjs', import.meta.url);

/** The `dist/node.js` of the vitest the project at `dir` installed, or `undefined` without one. */
function vitestOf(dir: string): string | undefined {
  try {
    return join(dirname(createRequire(join(dir, 'package.json')).resolve('vitest/package.json')), 'dist', 'node.js');
  } catch {
    return undefined;
  }
}

/**
 * `fudic test` / `fudic spec`: each project under a heading of its own, one after another, and a
 * last line with how many passed and which failed. Exit 1 when one did — or when none has the
 * script, which is a command that checked nothing.
 */
function runChecks(kind: CheckKind, plan: CheckPlan, cwd: string, deps: RunDeps): number {
  const what = kind === 'test' ? 'unit tests' : 'specs';
  if (plan.commands.length === 0) {
    deps.streams.err(`fudic ${kind}: no project here has a "${kind}" script — nothing to run\n`);
    return 1;
  }
  const clock = deps.clock ?? Date.now;
  const started = clock();
  const labels = plan.commands.map((command) => command.label);
  const projects = plan.commands.length === 1 ? '1 project' : `${plan.commands.length} projects`;
  // Every project still on the scaffold's `vitest run`: one vitest for all of them, which starts
  // once and shares its workers, instead of one pnpm and one vitest per project.
  const vitest = plan.shared ? (deps.vitestOf ?? vitestOf)(absolute(cwd, plan.commands[0]!.dir)) : undefined;
  if (vitest !== undefined) {
    deps.streams.out(`\n▸ ${labels.join(', ')}  ${what} · one vitest\n`);
    const status = deps.runner.run(process.execPath, [fileURLToPath(VITEST_PROJECTS), vitest, cwd, ...plan.commands.map((c) => absolute(cwd, c.dir))], cwd);
    deps.streams.out(`\nfudic ${kind} · ${projects} · ${status === 0 ? 'passed' : 'FAILED'} · ${duration(clock() - started)}\n`);
    return status === 0 ? 0 : 1;
  }
  const failed: string[] = [];
  for (const command of plan.commands) {
    deps.streams.out(`\n▸ ${command.label}  ${what} · ${command.dir}\n`);
    const at = clock();
    const status = deps.runner.run(command.command, command.args, absolute(cwd, command.dir));
    if (status !== 0) failed.push(command.label);
    deps.streams.out(`  ${command.label}  ${status === 0 ? 'passed' : 'FAILED'} in ${duration(clock() - at)}\n`);
  }
  const passed = plan.commands.length - failed.length;
  const tail = failed.length === 0 ? '' : ` · ${failed.length} failed: ${failed.join(', ')}`;
  deps.streams.out(`\nfudic ${kind} · ${projects} · ${passed} passed${tail} · ${duration(clock() - started)}\n`);
  return failed.length === 0 ? 0 : 1;
}

/**
 * What `fudic translate` adds to the output of a plan (SDD-58 §3.5): a line per locale, and an
 * exit code that is not 0 only when a message is wrong — an untranslated one is a warning, and
 * the catalogs were written all the same. Every other command ends in 0 here.
 */
function closing(plan: Plan, human: (text: string) => void): number {
  if (!('summary' in plan)) return 0;
  for (const s of (plan as TranslatePlan).summary) {
    human(`  ${s.locale}  ${s.total} messages · ${s.added} new · ${s.review} to review · ${s.missing} untranslated\n`);
  }
  return plan.diagnostics.some((entry) => entry.diagnostic.severity === 'error') ? 1 : 0;
}

/** The text a diagnostic's span refers to, when it can still be read. */
function sourceOf(cwd: string, file: string, io: ReadIo): string | undefined {
  const path = absolute(cwd, file);
  return io.exists(path) ? io.read(path) : undefined;
}

/**
 * The plan of a command. Each plan is imported when its command runs and not before (BUG-51):
 * between them they load the compiler, the formatter and the typecheck, and `fudic --help` or
 * `fudic test` has no use for any of it.
 */
async function build(command: Exclude<ReturnType<typeof parseArgs>, { kind: 'help' } | { kind: 'error' } | { kind: 'serve' }>, io: ReadIo): Promise<Plan> {
  switch (command.kind) {
    case 'new':
      return (await import('./plans/new.js')).planNew(command.name, command.opts, io);
    case 'workspace':
      return (await import('./plans/workspace.js')).planWorkspace(command.name, command.opts, io);
    case 'app':
      return (await import('./plans/app.js')).planApp(command.name, command.opts, io);
    case 'lib':
      return (await import('./plans/lib.js')).planLib(command.name, command.opts, io);
    case 'component':
      return (await import('./plans/component.js')).planComponent(command.tag, command.opts, io);
    case 'page':
      return (await import('./plans/page.js')).planPage(command.route, command.opts, io);
    case 'layout':
      return (await import('./plans/layout.js')).planLayout(command.name, command.opts, io);
    case 'snippet':
      return (await import('./plans/snippet.js')).planSnippet(command.name, command.opts, io);
    case 'spec':
      return (await import('./plans/spec.js')).planSpec(command.name, command.opts, io);
    case 'term':
      return (await import('./plans/term.js')).planTerm(command.name, command.opts, io);
    case 'fmt':
      return (await import('./plans/fmt.js')).planFmt(command.paths, command.opts, io);
    case 'check':
      return (await import('./plans/check.js')).planCheck(command.check, command.opts, io);
    case 'add':
      return (await import('./plans/add.js')).planAdd(command.module, command.opts, io);
    case 'service':
      return (await import('./plans/piece.js')).planService(command.name, command.opts, io);
    case 'form':
      return (await import('./plans/piece.js')).planForm(command.name, command.opts, io);
    case 'style':
      return (await import('./plans/style.js')).planStyle(command.name, command.opts, io);
    case 'translate':
      return (await import('./plans/translate.js')).planTranslate(command.opts, io);
  }
}
