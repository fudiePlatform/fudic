/**
 * Which fudic projects exist on disk, and which one a command is aimed at (SDD-44 §3.3).
 *
 * There is no workspace file, and there is not going to be one (§1.4): the list of packages
 * belongs to `pnpm-workspace.yaml`, and a registry repeating it would be a second place the
 * same fact lives — the argument this repo already used to reject the name→URL table and the
 * second copy of `routesDir`. **A directory is a fudic project if it has a `fudic.json`**,
 * and that is the whole discovery rule. It is what lets a project be moved somewhere else,
 * with `pnpm-workspace.yaml` adjusted, without the CLI ever being told.
 */

import { CONFIG_FILE, readProjectConfig, type ProjectConfig } from '@fudic/config';
import { absolute, joinPosix, toPosix } from '../paths.js';
import { SKIPPED, type ReadIo } from '../io.js';

/**
 * The file whose presence makes a directory the root of a workspace.
 *
 * pnpm is the only package manager this repo uses, and the workspace it generates is a pnpm
 * one: a `--pm npm` project is still a single project, and `fudic g app` outside a pnpm
 * workspace is FUD0780 rather than a second layout to support.
 */
export const WORKSPACE_FILE = 'pnpm-workspace.yaml';

/** A fudic project found on disk: a directory with a `fudic.json`. */
export interface Project {
  /** Directory name — how `--project` names it. */
  readonly name: string;
  /** Absolute path of its root, POSIX. */
  readonly path: string;
  readonly config: ProjectConfig;
}

/** The last segment of an absolute POSIX directory. */
function nameOf(dir: string): string {
  return dir.slice(dir.lastIndexOf('/') + 1);
}

/** The absolute POSIX form of a directory, which is the only form used in here. */
function normalize(dir: string): string {
  return toPosix(absolute(dir, '.'));
}

/** The next directory up, or `null` once there is no next one. */
function parentOf(dir: string): string | null {
  const parent = toPosix(absolute(dir, '..'));
  return parent === dir ? null : parent;
}

/**
 * The nearest directory at or above `from` that holds `file`.
 *
 * *At or above*, not above: `fudic g component` run in the project's own root has to find
 * that project, and a workspace root is the workspace root of itself.
 */
export function nearestWith(from: string, file: string, io: ReadIo): string | null {
  let dir: string | null = normalize(from);
  while (dir !== null) {
    if (io.exists(joinPosix(dir, file))) return dir;
    dir = parentOf(dir);
  }
  return null;
}

/**
 * The root of the workspace `cwd` belongs to, or `null` when it belongs to none.
 *
 * Two commands need it for different reasons: `fudic g app` and `fudic g lib` refuse to run
 * outside a workspace (FUD0780), and `--project` resolves against the WHOLE workspace, so
 * that naming a sibling works from inside a project and not only from the root.
 */
export function workspaceRoot(cwd: string, io: ReadIo): string | null {
  return nearestWith(cwd, WORKSPACE_FILE, io);
}

/**
 * Every fudic project under `root`. Empty outside a workspace; never throws.
 *
 * `node_modules` and `dist` are pruned exactly as `walkFud` prunes them: an installed
 * dependency that happens to be a fudic library is not a project of THIS workspace, and a
 * build output is a copy of one.
 *
 * A `fudic.json` that does not read excludes that one directory and stops nothing (§5). The
 * alternative — one broken file making its siblings undiscoverable — would turn a typo in one
 * package into `--project` failing to name any of the others.
 */
export function findProjects(root: string, io: ReadIo): readonly Project[] {
  const found: Project[] = [];

  const visit = (dir: string): void => {
    const { config } = readProjectConfig(dir, io);
    if (config !== null) found.push({ name: nameOf(dir), path: dir, config });
    // Sorted, so the order a command reports projects in does not depend on the order the
    // filesystem happens to hand back its entries.
    for (const entry of [...io.list(dir)].sort()) {
      if (SKIPPED.has(entry)) continue;
      const full = joinPosix(dir, entry);
      if (io.isDirectory(full)) visit(full);
    }
  };

  visit(normalize(root));
  return found;
}

/**
 * The project a command targets: `--project` when given, otherwise the nearest `fudic.json`
 * at or above `cwd`. `null` when neither answers (§4.3).
 *
 * There is no third route, and in particular **no default project**. Picking the only one, or
 * the first in alphabetical order, is the kind of convenience that writes a file into the
 * wrong package the day the second one shows up.
 */
export function targetProject(
  cwd: string,
  project: string | undefined,
  io: ReadIo,
): Project | null {
  if (project !== undefined) {
    // From the workspace root, so `--project ui` reaches the library from inside an app.
    // Outside a workspace there is nothing above to sweep, and `cwd` is the whole world.
    const root = workspaceRoot(cwd, io) ?? cwd;
    return findProjects(root, io).find((candidate) => candidate.name === project) ?? null;
  }

  const dir = nearestWith(cwd, CONFIG_FILE, io);
  if (dir === null) return null;

  const { config } = readProjectConfig(dir, io);
  // Unreadable is not a target. The command that asked still reports the FUD0720 itself,
  // from the root it resolved: "your fudic.json is broken" is a better answer than "no
  // project found", and it is the answer `fudic g component` has given since SDD-41.
  if (config === null) return null;
  return { name: nameOf(dir), path: dir, config };
}
