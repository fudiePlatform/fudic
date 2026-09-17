/**
 * Which project a generated piece goes to (SDD-44 §4.3).
 *
 * Two routes, in this order: `--project`, then the nearest `fudic.json` walking UP from
 * `--cwd`. There is no third, and in particular **no default project**. Choosing the only
 * one, or the first in alphabetical order, is the kind of convenience that writes a file into
 * the wrong package the day the second one shows up.
 *
 * `--cwd` has not changed meaning — it is still the root to operate on. What this adds is
 * that the PROJECT root is searched from there upwards.
 */

import { CONFIG_FILE, readProjectConfig, type ProjectConfig } from '@fudic/config';
import {
  cliError,
  FUD_NO_TARGET_PROJECT,
  FUD_PROJECT_UNKNOWN,
  FUD_ROUTE_IN_LIB,
} from '../diagnostics.js';
import { relativeTo } from '../paths.js';
import { findProjects, nearestWith, workspaceRoot } from './discover.js';
import type { ReadIo } from '../io.js';
import type { BaseOptions, CliError } from '../types.js';

/** The `--project` flag, shared by the three generators. */
export interface TargetOptions extends BaseOptions {
  /** The project's directory name. Absent ⇒ resolve from `cwd`. */
  readonly project?: string;
}

/** The project a piece is being written into. */
export interface Target {
  /** Its root, relative to `cwd` — the form a `FileChange` carries. `'.'` when it is `cwd`. */
  readonly dir: string;
  /** Its root, absolute POSIX, for the readers that take one. */
  readonly path: string;
  readonly config: ProjectConfig;
}

export interface TargetResolution {
  readonly target?: Target;
  readonly errors: readonly CliError[];
}

export function resolveTarget(opts: TargetOptions, io: ReadIo): TargetResolution {
  if (opts.project !== undefined) return byName(opts.project, opts.cwd, io);
  return byWalkingUp(opts.cwd, io);
}

/** `--project <n>`, matched against the directory name of a project of the workspace. */
function byName(project: string, cwd: string, io: ReadIo): TargetResolution {
  // From the workspace root, so naming a sibling works from inside a project and not only
  // from the root. Outside a workspace there is nothing above, and `cwd` is the whole world.
  const root = workspaceRoot(cwd, io) ?? cwd;
  const projects = findProjects(root, io);
  const found = projects.find((candidate) => candidate.name === project);
  if (found === undefined) {
    const names = projects.map((candidate) => candidate.name);
    return {
      errors: [
        cliError(
          FUD_PROJECT_UNKNOWN,
          `--project ${project}: no such project${
            names.length === 0 ? ' — there are none here' : `; there is: ${names.join(', ')}`
          }`,
        ),
      ],
    };
  }
  return { target: { dir: relativeTo(cwd, found.path), path: found.path, config: found.config }, errors: [] };
}

/** The nearest `fudic.json` at or above `cwd`, which is what makes `cd apps/x` enough. */
function byWalkingUp(cwd: string, io: ReadIo): TargetResolution {
  const dir = nearestWith(cwd, CONFIG_FILE, io);
  if (dir === null) {
    return {
      errors: [
        cliError(
          FUD_NO_TARGET_PROJECT,
          `no target project: there is no ${CONFIG_FILE} here or above. ` +
            'Run this inside a project, or name one with --project.',
        ),
      ],
    };
  }

  const { config, diagnostics } = readProjectConfig(dir, io);
  if (config === null) {
    // A `fudic.json` that does not read is reported AS ITSELF, not as "no project found":
    // the prefix is what decides the tag, so a broken file means the piece would be written
    // under a name its author did not choose. Saying which file, and why, beats both.
    return { errors: diagnostics.map((entry) => cliError(entry.code, entry.message, entry.file)) };
  }
  return { target: { dir: relativeTo(cwd, dir), path: dir, config }, errors: [] };
}

/**
 * `FUD0783`: a route does not fit in a library (§4.8).
 *
 * A library has no `routesDir`, no `base`, no plugin builds it, and a route of its own would
 * be reachable by no URL. A LAYOUT is a different matter and is legal: since SDD-40 a layout
 * declares props, which makes it a shareable piece with a point — the common shell of
 * several apps.
 */
export function routeRefusal(target: Target): CliError | null {
  if (target.config.kind !== 'lib') return null;
  return cliError(
    FUD_ROUTE_IN_LIB,
    `${target.dir} is a library, and a library has no routes: no base, no URL, and no plugin ` +
      'builds it. A layout can live here; a page cannot.',
  );
}
