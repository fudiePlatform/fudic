/**
 * Which apps `fudic dev` and `fudic preview` serve (BUG-50 §4.5): the one `--project` names;
 * otherwise, in a workspace, the app the command runs in, or every app under the folder it runs
 * in (finding 8 of the CLI: from `web/apps` of a monorepo, its three apps, not every app of the
 * repository); otherwise the app it runs in.
 */

import { FUD0453, FUD0454 } from '@fudic/diagnostics';
import { absolute, joinPosix, toPosix } from '../paths.js';
import { servedApps, type ServedApp } from '../workspace/bases.js';
import { findProjects, workspaceRoot } from '../workspace/discover.js';
import { resolveTarget } from '../workspace/target.js';
import type { ReadIo } from '../io.js';
import type { CliError, TargetedOptions } from '../types.js';
import type { ServeKind } from './workspace.js';

export interface AppsToServe {
  readonly apps: readonly ServedApp[];
  readonly errors: readonly CliError[];
}

export function appsToServe(kind: ServeKind, opts: TargetedOptions, io: ReadIo): AppsToServe {
  const found = candidates(opts, io);
  if (found.errors.length > 0) return found;
  if (found.apps.length === 0) return { apps: [], errors: [FUD0453()] };
  // `preview` serves what was built; an app with nothing built is said before anything starts.
  const unbuilt = kind === 'preview' ? found.apps.filter((app) => !io.isDirectory(joinPosix(app.path, 'dist'))) : [];
  return { apps: found.apps, errors: unbuilt.map((app) => FUD0454({ app: app.name })) };
}

function candidates(opts: TargetedOptions, io: ReadIo): AppsToServe {
  const root = workspaceRoot(opts.cwd, io);
  if (opts.project === undefined && root !== null) {
    // Resolved as the projects' paths are: absolute, with its drive on Windows, POSIX.
    const here = toPosix(absolute(opts.cwd, '.'));
    const all = servedApps(findProjects(root, io), io);
    const inside = all.find((app) => within(here, app.path));
    return { apps: inside === undefined ? all.filter((app) => within(app.path, here)) : [inside], errors: [] };
  }

  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return { apps: [], errors: resolved.errors };
  const { path, config } = resolved.target;
  return { apps: servedApps([{ name: path.slice(path.lastIndexOf('/') + 1), path, config }], io), errors: [] };
}

/** Whether `path` is `dir` or under it; both absolute, POSIX. */
function within(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`);
}
