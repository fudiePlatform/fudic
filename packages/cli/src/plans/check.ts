/**
 * `fudic test` and `fudic spec` (BUG-50 §3.1): the unit tests, or the `.fudspec` criteria, of the
 * project the command runs in — or of every project, from the root of a workspace.
 *
 * Plans of commands and nothing else: each project already knows how to run its own (its
 * `test` and `spec` scripts). From the root, one command per project that has the script, in
 * the order the workspace lists them — one at a time, because the criteria open a browser each.
 * `run.ts` runs them all, says which is which and sums them up (BUG-51); it does not stop at the
 * first that fails.
 *
 * `--silent`: pnpm's own lines — the scope, the `$ vitest run` echo — say nothing the heading
 * does not say better.
 */

import { findProjects, workspaceRoot } from '../workspace/discover.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { absolute, joinPosix, relativeTo, toPosix } from '../paths.js';
import { EMPTY_PLAN, type Plan, type PlanCommand, type TargetedOptions } from '../types.js';

export type CheckKind = 'test' | 'spec';

/** One project's run: the command, and the name its heading and the summary say. */
export interface CheckCommand extends PlanCommand {
  readonly label: string;
}

/** A plan of `fudic test` / `fudic spec`: its commands, each named. */
export interface CheckPlan extends Plan {
  readonly commands: readonly CheckCommand[];
}

/** Whether the project at `path` declares the script. One without a `package.json` has none. */
function hasScript(path: string, kind: CheckKind, io: ReadIo): boolean {
  const file = joinPosix(path, 'package.json');
  if (!io.exists(file)) return false;
  try {
    const scripts = (JSON.parse(io.read(file)) as { readonly scripts?: Readonly<Record<string, unknown>> }).scripts;
    return typeof scripts?.[kind] === 'string';
  } catch {
    return false;
  }
}

function commandFor(kind: CheckKind, cwd: string, path: string, label: string): CheckCommand {
  return { command: 'pnpm', args: ['--silent', 'run', kind], dir: relativeTo(cwd, path) || '.', label };
}

export function planCheck(kind: CheckKind, opts: TargetedOptions, io: ReadIo = nodeReadIo()): Promise<CheckPlan> {
  const root = workspaceRoot(opts.cwd, io);
  // At the root itself: every project with the script. The root's own `test` script is this
  // command, so the root is never one of them.
  if (opts.project === undefined && root !== null && root === toPosix(absolute(opts.cwd, '.'))) {
    const commands = findProjects(root, io)
      .filter((project) => project.path !== root && hasScript(project.path, kind, io))
      .map((project) => commandFor(kind, opts.cwd, project.path, project.name));
    return Promise.resolve({ ...EMPTY_PLAN, commands, report: [] });
  }
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, commands: [], errors: resolved.errors });
  const { path } = resolved.target;
  return Promise.resolve({
    ...EMPTY_PLAN,
    commands: [commandFor(kind, opts.cwd, path, path.slice(path.lastIndexOf('/') + 1))],
    report: [],
  });
}
