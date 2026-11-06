/**
 * `fudic_new`, `fudic_generate`, `fudic_add` and the CLI half of `fudic_record`: the command line
 * written from the tool's input, read by the CLI's own parser and planned by its own `planOf`.
 * What the agent creates is, byte for byte, what a developer typing the command creates.
 *
 * The commands of a plan run with their output kept: over stdio, stdout is the protocol.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { FileChange, Plan, PlanCommand, PlannedCommand } from '@fudic/cli';
import { FUD1411 } from '@fudic/diagnostics';
import type { Checks } from './checks.js';
import type { Cli } from './fudic.js';
import type { Problem } from './diagnostics.js';
import type { Project } from './project.js';
import type { Answer } from './respond.js';

/** A value of an option, as the tool takes it. */
export type OptionValue = string | boolean | readonly string[] | undefined;

/** `skipTest` → `skip-test`. */
export function flagOf(name: string): string {
  return name.replace(/[A-Z]/gu, (upper) => `-${upper.toLowerCase()}`);
}

/** Flags whose value is repeated rather than written as one comma list. */
const REPEATED: ReadonlySet<string> = new Set(['param']);

/** The options of a tool, as the command line writes them; `false` and absent write nothing. */
export function flagsOf(options: Readonly<Record<string, OptionValue>>): readonly string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined || value === false) continue;
    const flag = `--${flagOf(name)}`;
    if (value === true) out.push(flag);
    else if (typeof value === 'string') out.push(flag, value);
    else if (REPEATED.has(flagOf(name))) for (const one of value) out.push(flag, one);
    else out.push(flag, value.join(','));
  }
  return out;
}

/** What one command of a plan did. */
export interface CommandRun {
  readonly command: string;
  readonly dir: string;
  readonly status: number | null;
  /** Its last lines, only when it failed: the words of pnpm or git that say why. */
  readonly output?: string;
}

/** A runner that never writes to this process's streams, and keeps what each command said. */
export function quietRunner(cli: Cli, runs: CommandRun[]): { run(command: string, args: readonly string[], dir: string): number | null } {
  return {
    run(command, args, dir) {
      mkdirSync(dir, { recursive: true });
      const result = spawnSync(command, [...args], { cwd: dir, encoding: 'utf8', shell: cli.needsShell(command, process.platform) });
      const status = result.error === undefined ? result.status : null;
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-20).join('\n');
      runs.push({ command: [command, ...args].join(' '), dir, status, ...(status !== 0 && output !== '' ? { output } : {}) });
      return status;
    },
  };
}

/** The plan of a command line, and the answer the tools share; or why it could not be planned. */
export interface Planned {
  readonly plan?: Plan;
  readonly command?: PlannedCommand;
  readonly answer: Answer;
}

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** A change as an answer lists it: what happens to which file. */
function changeOf(change: FileChange): Readonly<Record<string, string>> {
  return { [change.kind === 'create' ? 'create' : 'modify']: posix(change.path) };
}

/** The problems of a plan, in project coordinates. */
function problemsOf(plan: Plan, root: string): readonly Problem[] {
  return [
    ...plan.errors.map((e): Problem => (e.file === undefined ? e : { ...e, file: `${root}/${e.file}` })),
    ...plan.diagnostics.map((d): Problem => ({ ...d.diagnostic, file: `${root}/${d.file}` })),
  ];
}

/**
 * Parse, plan and — unless it is a dry run — apply a command line in `cwd`. `rewrite` may change
 * the plan before it is applied: `fudic_new` takes the project's folder off every path.
 */
export async function runPlan(
  cli: Cli,
  project: Project,
  argv: readonly string[],
  options: { readonly dryRun: boolean; readonly cwd?: string; readonly rewrite?: (plan: Plan) => Plan },
): Promise<Planned> {
  const cwd = options.cwd ?? project.root;
  const parsed = cli.parseArgs([...argv, '--cwd', cwd]);
  if (parsed.kind === 'error') {
    return { answer: { body: { command: `fudic ${argv.join(' ')}`, hints: parsed.hints }, diagnostics: [parsed.error], failed: true } };
  }
  // Every command a tool writes is a plan: `help`, `serve` and `history` are never written.
  const command = parsed as PlannedCommand;
  const runs: CommandRun[] = [];
  const runner = quietRunner(cli, runs);
  const deps = { readIo: cli.nodeReadIo(), writeIo: cli.nodeWriteIo(), runner, streams: { out: () => undefined, err: () => undefined } };
  let planned: Plan;
  try {
    planned = await cli.planOf(command, deps);
  } catch (error) {
    // A planner that stops — `g showcase` before the install — is a diagnostic, never a throw.
    const shown = `fudic ${argv.join(' ')}`;
    return { command, answer: { body: { command: shown }, diagnostics: [FUD1411({ command: shown, reason: (error as Error).message })], failed: true } };
  }
  const plan = options.rewrite === undefined ? planned : options.rewrite(planned);
  const problems = problemsOf(plan, project.root);
  const body = {
    command: `fudic ${argv.join(' ')}`,
    changes: plan.changes.map(changeOf),
    commands: plan.commands.map((c: PlanCommand) => [c.command, ...c.args].join(' ')),
  };
  if (plan.errors.length > 0) return { plan, command, answer: { body, diagnostics: problems, failed: true } };
  if (options.dryRun) return { plan, command, answer: { body: { ...body, written: false }, diagnostics: problems } };

  const applied = await cli.apply(plan, command.opts, cli.nodeWriteIo(), runner);
  const failed = applied.failed !== undefined;
  return {
    plan,
    command,
    answer: {
      body: { ...body, written: true, ran: runs, ...(plan.report !== undefined && !failed ? { report: plan.report } : {}) },
      diagnostics: problems,
      ...(failed ? { failed: true as const } : {}),
    },
  };
}

/**
 * After a plan that installs — `new`, `add` —, the fudic the project answers with may be a new
 * one: the server mounts it again on the next call. Any other plan only writes files, and the
 * dates of those are what the next check reads.
 */
export function afterInstall(checks: Checks, planned: Planned): void {
  if (planned.answer.body['written'] === true) checks.reset();
}
