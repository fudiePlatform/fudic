/**
 * Where a new project goes, and the two refusals that come before anything is written
 * (SDD-44 §4.1, §5).
 *
 * `fudic g app` and `fudic g lib` differ in what they write, not in where. Both hang from
 * the WORKSPACE ROOT rather than from `cwd`, which is what makes
 * `cd apps/tienda && fudic g app admin` put the new app beside the old one instead of inside
 * it — and both refuse outside a workspace, because `apps/` and `libs/` mean nothing on
 * their own.
 */

import { CONFIG_FILE } from '@fudic/config';
import { cliError, FUD_NOT_A_WORKSPACE, FUD_PROJECT_EXISTS } from '../diagnostics.js';
import { absolute, joinPosix, relativeTo, toPosix } from '../paths.js';
import { findProjects, workspaceRoot, WORKSPACE_FILE, type Project } from './discover.js';
import { workspaceScope } from './uses.js';
import type { ReadIo } from '../io.js';
import type { CliError, ProjectOptions } from '../types.js';

/**
 * Where apps and libraries hang by default.
 *
 * They belong to the CLI and **not** to `@fudic/conventions`: it writes them and nobody else
 * reads them, because discovery goes through `fudic.json` (§4.1). Moving them down into the
 * shared package would declare a convention no second package consumes — and that package is
 * for names *two* packages must agree on. It is also why `--dir` exists: the layout is a
 * default, not a rule.
 */
export const APPS_DIR = 'apps';
export const LIBS_DIR = 'libs';

/** A resolved spot for a new project, with everything its files need to name themselves. */
export interface Placement {
  /** The workspace root. Absolute, POSIX. */
  readonly root: string;
  /** The npm scope every package of this workspace is named under. */
  readonly scope: string;
  /** The new project's directory, relative to `cwd` — the form a `FileChange` carries. */
  readonly dir: string;
  /** The relative path from that directory back up to the root (§4.6). */
  readonly up: string;
  /** Every project already in the workspace, for `--uses` and for the collision check. */
  readonly projects: readonly Project[];
}

export interface PlacementResult {
  readonly placement?: Placement;
  readonly errors: readonly CliError[];
}

/**
 * The spot, or the reason there is none.
 *
 * FUD0784 covers both shapes of "taken": a project already in that directory, and a project
 * elsewhere already answering to that name. The second matters because the name is what
 * `--project` says and what the package scope is built from — two projects called `ui` would
 * make `--project ui` a coin toss and `@ws/ui` ambiguous.
 */
export function placeProject(
  name: string,
  opts: ProjectOptions,
  io: ReadIo,
): PlacementResult {
  const root = workspaceRoot(opts.cwd, io);
  if (root === null) {
    return {
      errors: [
        cliError(
          FUD_NOT_A_WORKSPACE,
          `not inside a workspace: no ${WORKSPACE_FILE} here or above. ` +
            'Create one with `fudic new <name> --workspace`.',
        ),
      ],
    };
  }

  const target = toPosix(absolute(joinPosix(root, opts.dir), name));
  const projects = findProjects(root, io);

  if (!opts.force) {
    const taken = projects.find((project) => project.name === name);
    if (taken !== undefined) {
      return {
        errors: [
          cliError(
            FUD_PROJECT_EXISTS,
            `a project named "${name}" is already at ${relativeTo(root, taken.path)}; ` +
              'pass --force to overwrite',
            relativeTo(opts.cwd, taken.path),
          ),
        ],
      };
    }
    // A directory whose `fudic.json` does not read is absent from `projects`, and it is
    // still a project: overwriting it because its config is broken would be the worst
    // possible moment to stop asking.
    if (io.exists(joinPosix(target, CONFIG_FILE))) {
      return {
        errors: [
          cliError(
            FUD_PROJECT_EXISTS,
            `${relativeTo(root, target)} is already a fudic project; pass --force to overwrite`,
            relativeTo(opts.cwd, target),
          ),
        ],
      };
    }
  }

  return {
    placement: {
      root,
      scope: workspaceScope(root, io),
      dir: relativeTo(opts.cwd, target),
      up: relativeTo(target, root),
      projects,
    },
    errors: [],
  };
}
