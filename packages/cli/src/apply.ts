/**
 * The only writer (SDD-22 §3.2). It applies a plan verbatim: files first, in order, then
 * the commands. A plan carrying `errors` is never applied — that is what makes "cero
 * ficheros escritos" a property of the design and not of each call site remembering to
 * check.
 */

import { absolute } from './paths.js';
import { nodeCommandRunner, nodeWriteIo, type CommandRunner, type WriteIo } from './io.js';
import type { BaseOptions, FileChange, Plan } from './types.js';

export function apply(
  plan: Plan,
  opts: BaseOptions,
  io: WriteIo = nodeWriteIo(),
  runner: CommandRunner = nodeCommandRunner(),
): Promise<readonly FileChange[]> {
  if (plan.errors.length > 0) return Promise.resolve([]);

  for (const change of plan.changes) io.write(absolute(opts.cwd, change.path), change.contents);
  for (const command of plan.commands) runner.run(command.command, command.args, absolute(opts.cwd, command.dir));

  return Promise.resolve(plan.changes);
}
