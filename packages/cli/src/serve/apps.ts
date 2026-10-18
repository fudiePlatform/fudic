/**
 * Which apps `fudic dev` and `fudic preview` serve (BUG-50 §4.5): the one `--project` names;
 * otherwise every app of the workspace the command runs in; otherwise the app it runs in.
 */

import { FUD0453, FUD0454 } from '@fudic/diagnostics';
import { joinPosix } from '../paths.js';
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
  if (opts.project === undefined && root !== null) return { apps: servedApps(findProjects(root, io), io), errors: [] };

  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return { apps: [], errors: resolved.errors };
  const { path, config } = resolved.target;
  return { apps: servedApps([{ name: path.slice(path.lastIndexOf('/') + 1), path, config }], io), errors: [] };
}
