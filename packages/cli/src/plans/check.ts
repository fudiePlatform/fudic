/**
 * `fudic test` and `fudic spec` (BUG-50 §3.1): the unit tests, or the `.fudspec` criteria, of the
 * project the command runs in — or of every project, from the root of a workspace.
 *
 * Plans of commands and nothing else: each project already knows how to run its own (its
 * `test` and `spec` scripts), so the root asks every one of them, one at a time — the criteria
 * open a browser each — and without stopping at the first that fails.
 */

import { workspaceRoot } from '../workspace/discover.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { absolute, relativeTo, toPosix } from '../paths.js';
import { EMPTY_PLAN, type Plan, type TargetedOptions } from '../types.js';

export type CheckKind = 'test' | 'spec';

export function planCheck(kind: CheckKind, opts: TargetedOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const root = workspaceRoot(opts.cwd, io);
  // At the root itself: every project. `-r` leaves the root out, so its own `test` script — which
  // is this command — does not call itself.
  if (opts.project === undefined && root !== null && root === toPosix(absolute(opts.cwd, '.'))) {
    return Promise.resolve({
      ...EMPTY_PLAN,
      commands: [{ command: 'pnpm', args: ['-r', '--no-bail', '--workspace-concurrency=1', 'run', kind], dir: '.' }],
      report: [],
    });
  }
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  return Promise.resolve({
    ...EMPTY_PLAN,
    commands: [{ command: 'pnpm', args: ['run', kind], dir: relativeTo(opts.cwd, resolved.target.path) || '.' }],
    report: [],
  });
}
