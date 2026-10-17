/**
 * `fudic new <nombre> --workspace` (SDD-44 §4.2, BUG-50 §4.5): the root of §4.1 **and** a first
 * app.
 *
 * Not the root alone, and that is the whole decision: a workspace with no app does not
 * build, cannot be tried and teaches nothing. The command hands over something that runs.
 *
 * The root itself is NOT a fudic project — it carries no `fudic.json` — and that is not an
 * omission either (§4.1). If it carried one, `targetProject` from a `cwd` outside every app
 * would resolve to the root and sow components in the monorepo's own directory. What it
 * carries is how to run everything at once: `dev`, `preview`, `build`, `test` and `spec`.
 */

import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import { appFiles, scaffoldChanges, scaffoldRefusal, type ScaffoldFile } from './scaffold.js';
import { libFiles } from './lib.js';
import { setupCommands, setupReport } from './new.js';
import { joinPosix } from '../paths.js';
import { FUDIC_VERSION, TYPESCRIPT_VERSION } from '../project.js';
import { renderTemplate } from '../templates.js';
import { prefixOf } from '../tag.js';
import { DEV_PORT } from '../workspace/bases.js';
import { appUses } from '../workspace/uses.js';
import { WORKSPACE_FILE } from '../workspace/discover.js';
import { APPS_DIR, LIBS_DIR } from '../workspace/place.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type Plan, type WorkspaceOptions } from '../types.js';

/** The workspace root: tooling, the package list, and the two files §4.6 keeps in one place. */
function rootFiles(name: string, opts: WorkspaceOptions): readonly ScaffoldFile[] {
  return [
    [
      joinPosix(name, 'package.json'),
      renderTemplate('workspace/package.json.tmpl', { name, version: FUDIC_VERSION, tsVersion: TYPESCRIPT_VERSION }),
    ],
    [joinPosix(name, 'README.md'), renderTemplate('workspace/README.md.tmpl', { name, app: opts.app })],
    [joinPosix(name, WORKSPACE_FILE), renderTemplate('workspace/pnpm-workspace.yaml.tmpl', {})],
    [joinPosix(name, 'tsconfig.base.json'), renderTemplate('workspace/tsconfig.base.json.tmpl', {})],
    [joinPosix(name, GLOBALS_FILE_NAME), GLOBALS_DTS],
    [joinPosix(name, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
    // `libs/` exists from the start, so the tree says where a library goes: empty, or with the
    // libraries `--uses` asked for.
    ...(opts.uses.length === 0
      ? ([[joinPosix(name, LIBS_DIR, '.gitkeep'), '']] as const)
      : opts.uses.flatMap((lib) =>
          libFiles({ dir: joinPosix(name, LIBS_DIR, lib), up: '../..', scope: `@${name}`, name: lib, prefix: prefixOf(lib), uses: [] }),
        )),
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
      // now live at the root. `up` is what says so. It is the first app, so it is at `/`.
      ...appFiles({ dir: appDir, pkgName: `@${name}/${opts.app}`, up: '../..', uses: appUses(`@${name}`, opts.uses) }, opts),
    ],
    io,
  );

  // The install and the repository belong to the WORKSPACE, not to the app: one lockfile,
  // one history. An app that installed its own dependencies would be a package outside the
  // workspace that happens to sit inside its directory.
  const message = `chore: create workspace ${name}`;
  return Promise.resolve({
    ...EMPTY_PLAN,
    changes,
    errors,
    commands: setupCommands(name, opts, message),
    report: [
      '',
      `Created workspace ${name}`,
      '',
      `  ${name}/`,
      '    README.md          what apps/ and libs/ are, and the commands below',
      `    ${`${APPS_DIR}/${opts.app}/`.padEnd(19)}app ${opts.app}, served at /`,
      ...(opts.uses.length === 0
        ? [`    ${`${LIBS_DIR}/`.padEnd(19)}empty — fudic g lib <name>`]
        : opts.uses.map((lib) => `    ${`${LIBS_DIR}/${lib}/`.padEnd(19)}library ${lib}, used by ${opts.app}`)),
      ...setupReport(opts, message),
      '',
      'Next',
      `  cd ${name}`,
      `  pnpm dev           http://localhost:${DEV_PORT}/`,
      '  pnpm test          unit tests of every project',
      '  pnpm spec          .fudspec criteria of every project',
    ],
  });
}
