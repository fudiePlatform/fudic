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
  /** The project's own `test` / `spec` script, as written: what tells a scaffolded one apart. */
  readonly script: string;
}

/** The `test` script `fudic new` writes: projects that keep it can share one vitest. */
export const SCAFFOLD_TEST_SCRIPT = 'vitest run';

/** A plan of `fudic test` / `fudic spec`: its commands, each named. */
export interface CheckPlan extends Plan {
  readonly commands: readonly CheckCommand[];
  /**
   * Every project is on the scaffold's `vitest run`, so one vitest can run them all. A project
   * that wrote its own script runs it, and then each goes on its own.
   */
  readonly shared: boolean;
}

function checkPlan(kind: CheckKind, commands: readonly CheckCommand[]): CheckPlan {
  const shared = kind === 'test' && commands.length > 0 && commands.every((c) => c.script === SCAFFOLD_TEST_SCRIPT);
  return { ...EMPTY_PLAN, commands, report: [], shared };
}

/** The script the project at `path` declares, if it declares one. No `package.json`, none. */
function scriptOf(path: string, kind: CheckKind, io: ReadIo): string | undefined {
  const file = joinPosix(path, 'package.json');
  if (!io.exists(file)) return undefined;
  try {
    const script = (JSON.parse(io.read(file)) as { readonly scripts?: Readonly<Record<string, unknown>> }).scripts?.[kind];
    return typeof script === 'string' ? script : undefined;
  } catch {
    return undefined;
  }
}

function commandFor(kind: CheckKind, cwd: string, path: string, label: string, script: string): CheckCommand {
  return { command: 'pnpm', args: ['--silent', 'run', kind], dir: relativeTo(cwd, path) || '.', label, script };
}

export function planCheck(kind: CheckKind, opts: TargetedOptions, io: ReadIo = nodeReadIo()): Promise<CheckPlan> {
  const root = workspaceRoot(opts.cwd, io);
  // At the root itself: every project with the script. The root's own `test` script is this
  // command, so the root is never one of them.
  if (opts.project === undefined && root !== null && root === toPosix(absolute(opts.cwd, '.'))) {
    const commands = findProjects(root, io).flatMap((project) => {
      const script = project.path === root ? undefined : scriptOf(project.path, kind, io);
      return script === undefined ? [] : [commandFor(kind, opts.cwd, project.path, project.name, script)];
    });
    return Promise.resolve(checkPlan(kind, commands));
  }
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, commands: [], errors: resolved.errors, shared: false });
  const { path } = resolved.target;
  const script = scriptOf(path, kind, io);
  const label = path.slice(path.lastIndexOf('/') + 1);
  return Promise.resolve(checkPlan(kind, script === undefined ? [] : [commandFor(kind, opts.cwd, path, label, script)]));
}
