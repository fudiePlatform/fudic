/**
 * `fudic new <nombre> --workspace` (SDD-44 §4.2): the root of §4.1 **and** a first app.
 *
 * Not the root alone, and that is the whole decision: a workspace with no app does not
 * build, cannot be tried and teaches nothing. The command hands over something that runs.
 *
 * The root itself is NOT a fudic project — it carries no `fudic.json` — and that is not an
 * omission either (§4.1). If it carried one, `targetProject` from a `cwd` outside every app
 * would resolve to the root and sow components in the monorepo's own directory.
 */

import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import { appFiles, scaffoldChanges, scaffoldRefusal, type ScaffoldFile } from './scaffold.js';
import { setupCommands } from './new.js';
import { joinPosix } from '../paths.js';
import { TYPESCRIPT_VERSION } from '../project.js';
import { renderTemplate } from '../templates.js';
import { WORKSPACE_FILE } from '../workspace/discover.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type Plan, type WorkspaceOptions } from '../types.js';

/**
 * Where apps and libraries hang by default.
 *
 * They belong to the CLI and **not** to `@fudic/conventions`: it writes them and nobody else
 * reads them, because discovery goes through `fudic.json` (§4.1). Moving them down into the
 * shared package would be declaring a convention no second package consumes — and
 * `@fudic/conventions` is for names two packages must agree on.
 */
export const APPS_DIR = 'apps';
export const LIBS_DIR = 'libs';

/** The workspace root: tooling, the package list, and the two files §4.6 keeps in one place. */
function rootFiles(name: string, opts: WorkspaceOptions): readonly ScaffoldFile[] {
  return [
    [
      joinPosix(name, 'package.json'),
      renderTemplate('workspace/package.json.tmpl', { name, tsVersion: TYPESCRIPT_VERSION }),
    ],
    [joinPosix(name, WORKSPACE_FILE), renderTemplate('workspace/pnpm-workspace.yaml.tmpl', {})],
    [joinPosix(name, 'tsconfig.base.json'), renderTemplate('workspace/tsconfig.base.json.tmpl', {})],
    [joinPosix(name, GLOBALS_FILE_NAME), GLOBALS_DTS],
    [joinPosix(name, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
  ];
}

export function planWorkspace(
  name: string,
  opts: WorkspaceOptions,
  io: ReadIo = nodeReadIo(),
): Promise<Plan> {
  const refused = scaffoldRefusal(name, opts, io);
  if (refused !== null) return Promise.resolve({ ...EMPTY_PLAN, errors: [refused] });

  const appDir = joinPosix(name, APPS_DIR, opts.app);
  const { changes, errors } = scaffoldChanges(
    opts,
    [
      ...rootFiles(name, opts),
      // The same app `fudic new` writes, from the same builder — minus the two files that
      // now live at the root. `up` is what says so.
      ...appFiles({ dir: appDir, pkgName: `@${name}/${opts.app}`, up: '../..' }, opts),
    ],
    io,
  );

  // The install and the repository belong to the WORKSPACE, not to the app: one lockfile,
  // one history. An app that installed its own dependencies would be a package outside the
  // workspace that happens to sit inside its directory.
  return Promise.resolve({ ...EMPTY_PLAN, changes, errors, commands: setupCommands(name, opts) });
}
