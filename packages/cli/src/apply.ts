/**
 * The only writer (SDD-22 §3.2). It applies a plan verbatim: files first, in order, then
 * the commands. A plan carrying `errors` is never applied — that is what makes "cero
 * ficheros escritos" a property of the design and not of each call site remembering to
 * check.
 *
 * The commands are not fire-and-forget. A `pnpm install` that dies leaves a project that
 * cannot build, and the three `git` commands that would follow it are noise on top of a
 * failure, so the first non-zero exit stops the rest and is reported to the caller. The
 * files already written stay: they are written before any command runs, and deleting them
 * would take away the very tree the user is about to look at.
 */

import { absolute } from './paths.js';
import { nodeCommandRunner, nodeWriteIo, type CommandRunner, type WriteIo } from './io.js';
import type { BaseOptions, CommandFailure, FileChange, Plan } from './types.js';

/** What `apply` did: the changes written, and the command that stopped it, if any. */
export interface ApplyResult {
  readonly changes: readonly FileChange[];
  readonly failed?: CommandFailure;
}

export function apply(
  plan: Plan,
  opts: BaseOptions,
  io: WriteIo = nodeWriteIo(),
  runner: CommandRunner = nodeCommandRunner(),
): Promise<ApplyResult> {
  if (plan.errors.length > 0) return Promise.resolve({ changes: [] });

  for (const change of plan.changes) io.write(absolute(opts.cwd, change.path), change.contents);

  for (const command of plan.commands) {
    const status = runner.run(command.command, command.args, absolute(opts.cwd, command.dir));
    if (status === 0) continue;
    return Promise.resolve({ changes: plan.changes, failed: { command, status } });
  }

  return Promise.resolve({ changes: plan.changes });
}
