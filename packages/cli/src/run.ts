/**
 * The binary is a shell over the plan API (SDD-22 §3.2). This module owns exactly three
 * things: argv → command, command → plan, plan → (print | apply). Exit codes:
 *
 *   0  success
 *   1  usage error, or a collision without --force
 *   2  a compiler diagnostic on a file the CLI was asked to modify (--in)
 *
 * It never throws: an unexpected error becomes an exit code, because a Node stack trace in
 * the terminal is a failure of the CLI (SDD-22 §5).
 */

import { parseArgs, USAGE } from './args.js';
import { apply } from './apply.js';
import { FUD_WIRE_TARGET_BROKEN } from './diagnostics.js';
import { absolute } from './paths.js';
import { planComponent } from './plans/component.js';
import { planLayout } from './plans/layout.js';
import { planNew } from './plans/new.js';
import { planPage } from './plans/page.js';
import { formatDiff, formatError, formatDiagnostic, formatPlan, planToJson } from './report.js';
import { nodeCommandRunner, nodeReadIo, nodeWriteIo, type CommandRunner, type ReadIo, type WriteIo } from './io.js';
import type { Plan } from './types.js';

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
}

function nodeStreams(): Streams {
  return {
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  };
}

export function defaultDeps(): RunDeps {
  return { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner: nodeCommandRunner(), streams: nodeStreams() };
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
    deps.streams.out(USAGE);
    return 0;
  }
  if (command.kind === 'error') {
    deps.streams.err(`${formatError(command.error)}\n\n${USAGE}`);
    return 1;
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
    return plan.errors.some((error) => error.code === FUD_WIRE_TARGET_BROKEN) ? 2 : 1;
  }

  if (flags.json) deps.streams.out(`${planToJson(plan)}\n`);

  if (flags.dryRun) {
    human(`${['dry run — nothing written', ...formatPlan(plan)].join('\n')}\n`);
    for (const change of plan.changes) {
      if (change.kind === 'modify') human(`${formatDiff(change).join('\n')}\n`);
    }
    return 0;
  }

  const applied = await apply(plan, command.opts, deps.writeIo, deps.runner);
  if (!flags.json) human(`${applied.map((change) => (change.kind === 'create' ? `  create  ${change.path}` : `  modify  ${change.path}`)).join('\n')}\n`);
  return 0;
}

/** The text a diagnostic's span refers to, when it can still be read. */
function sourceOf(cwd: string, file: string, io: ReadIo): string | undefined {
  const path = absolute(cwd, file);
  return io.exists(path) ? io.read(path) : undefined;
}

function build(command: Exclude<ReturnType<typeof parseArgs>, { kind: 'help' } | { kind: 'error' }>, io: ReadIo): Promise<Plan> {
  switch (command.kind) {
    case 'new':
      return planNew(command.name, command.opts, io);
    case 'component':
      return planComponent(command.tag, command.opts, io);
    case 'page':
      return planPage(command.route, command.opts, io);
    case 'layout':
      return planLayout(command.name, command.opts, io);
  }
}
