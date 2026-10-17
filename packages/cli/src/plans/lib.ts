/**
 * `fudic g lib <nombre>` (SDD-44 §4.5): a library, generated to be CONSUMED.
 *
 * Not an app with things taken away, which is the obvious idea and the wrong one (§1.2). What
 * a library lacks is not a list of omissions: it is everything needed to SERVE an application,
 * and a library is not served. So there is no `vite.config.ts`, no `sw.json`, no `src/routes/`
 * and no layout — and no `id`, because it has no caches to name.
 *
 * What it has instead is the thing that defines it: a `package.json` whose `exports` and
 * `files` point at the **`.fud` sources**, not at a `dist` (SDD-43 §4.1). Generated as an app
 * minus some files, it would produce a package nobody can consume.
 *
 * And it is born able to test its components (BUG-50 §4.2): the same `vitest.config.ts`, test
 * dependencies and `test`/`spec` scripts as an app. The bench never reads a project's Vite
 * config, so serving nothing costs the library nothing there.
 *
 * It names `@fudic/core`, and it names it as a **peer**. Every component emits a client chunk
 * (SDD-15) and that chunk imports the runtime, resolved from the file that makes it — which
 * lives in the LIBRARY, so the library has to declare it or a consumer's build cannot resolve
 * it. But a plain dependency would let a published library bring its OWN copy of the runtime
 * alongside the app's, and the runtime is not copyable: two copies mean two custom-element
 * registrations of the same tag and two sets of signals that do not see each other. A peer
 * says *the app provides it, and there is one*, which is the only arrangement that survives
 * a suite of components installed from npm across several apps.
 *
 * The `devDependencies` copy is what lets the library be developed and typechecked on its
 * own; it is not what a consumer installs.
 */

import { CONFIG_FILE } from '@fudic/config';
import { COMPONENTS_DIR } from '@fudic/conventions';
import { scaffoldChanges, testingFiles, tsconfigFor, type ScaffoldFile } from './scaffold.js';
import { joinPosix, relativeTo } from '../paths.js';
import { FUDIC_VERSION, VITE_VERSION, VITEST_VERSION } from '../project.js';
import { placeProject } from '../workspace/place.js';
import { libUses, packageOf, usesErrors } from '../workspace/uses.js';
import { mainApp } from '../workspace/bases.js';
import type { Project } from '../workspace/discover.js';
import { prefixField, renderTemplate } from '../templates.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type Plan, type LibOptions } from '../types.js';

/**
 * `src/components/` has to exist, and a directory is not a file.
 *
 * `.gitkeep` is how an empty directory survives a commit, and it is the whole content of this
 * one: the alternative — a sample component — is a file the author deletes before writing
 * anything, and a tag claimed in the global registry by nobody's decision.
 */
const KEEP = '.gitkeep';

export function planLib(
  name: string,
  opts: LibOptions,
  io: ReadIo = nodeReadIo(),
): Promise<Plan> {
  const placed = placeProject(name, opts, io);
  if (placed.placement === undefined) {
    return Promise.resolve({ ...EMPTY_PLAN, errors: placed.errors });
  }
  const { root, dir, up, scope, projects } = placed.placement;

  const errors = usesErrors(opts.uses, projects);
  if (errors.length > 0) return Promise.resolve({ ...EMPTY_PLAN, errors });

  if (opts.stylesOnly === true) {
    const styles = scaffoldChanges(opts, stylesFiles(dir, packageOf(scope, name), name), io);
    return Promise.resolve({
      ...EMPTY_PLAN,
      changes: styles.changes,
      errors: styles.errors,
      report: stylesReport(name, dir, projects, mainApp(projects, io) ?? 'web'),
    });
  }

  const files = libFiles({ dir, up, scope, name, prefix: opts.prefix, uses: opts.uses });

  const built = scaffoldChanges(opts, files, io);
  return Promise.resolve({
    ...EMPTY_PLAN,
    changes: built.changes,
    errors: built.errors,
    // The install is the workspace's, from its root, as for `g app` (BUG-50 §4.6).
    commands: [{ command: 'pnpm', args: ['install'], dir: relativeTo(opts.cwd, root) || '.', quiet: true }],
    report: libReport(name, dir, opts.prefix, mainApp(projects, io) ?? 'web'),
  });
}

/** What `g lib` tells the user (BUG-50 §6.3). */
function libReport(name: string, dir: string, prefix: string, app: string): readonly string[] {
  const add = `fudic add ${name} --project ${app}`;
  const create = `fudic g app admin --uses ${name}`;
  const width = Math.max(add.length, create.length) + 10;
  return [
    '',
    `Created library ${name} in ${dir}`,
    '',
    `  tag prefix   ${`${prefix}-`.padEnd(9)}fudic g component button --project ${name}  →  <${prefix}-button>`,
    `  test         pnpm --filter ${name} test`,
    `  spec         pnpm --filter ${name} spec`,
    '',
    '  Installed dependencies (pnpm)',
    '',
    'Use it from an app',
    `  ${add.padEnd(width - 1)}an app you already have`,
    `  ${create.padEnd(width - 1)}a new app`,
  ];
}

/** Where a library goes and what it is called: what its files need to know. */
export interface LibSite {
  /** Its directory, relative to `cwd`. */
  readonly dir: string;
  /** From it up to the workspace root. */
  readonly up: string;
  /** The npm scope of the workspace. */
  readonly scope: string;
  readonly name: string;
  readonly prefix: string;
  readonly uses: readonly string[];
}

/** The files of a library: what `g lib` writes, and `new --workspace --uses` too. */
export function libFiles({ dir, up, scope, name, prefix, uses }: LibSite): readonly ScaffoldFile[] {
  const pkgName = packageOf(scope, name);
  return [
    [
      joinPosix(dir, 'package.json'),
      renderTemplate('lib/package.json.tmpl', {
        name: pkgName,
        version: FUDIC_VERSION,
        viteVersion: VITE_VERSION,
        vitestVersion: VITEST_VERSION,
        uses: libUses(scope, uses),
      }),
    ],
    [joinPosix(dir, 'README.md'), renderTemplate('lib/README.md.tmpl', { name: pkgName, project: name, prefix: prefix })],
    [joinPosix(dir, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
    // No `id`: a library has no Service Worker and therefore no caches to namespace. The
    // prefix is the library's name unless `--prefix` says otherwise (BUG-50 §3.2): its tags
    // live in the registry of apps it does not control.
    [
      joinPosix(dir, CONFIG_FILE),
      renderTemplate('lib/fudic.json.tmpl', { prefix: prefixField(prefix) }),
    ],
    [joinPosix(dir, 'tsconfig.json'), tsconfigFor({ dir, pkgName, up, uses: '' })],
    ...testingFiles(dir),
    [joinPosix(dir, COMPONENTS_DIR, KEEP), ''],
  ];
}

/**
 * A style library (`--styles-only`, BUG-50 §4.7): `tokens.css` as its one global stylesheet,
 * published as itself, like `examples/workspace/libs/guia`. Nothing to test, so no test tooling.
 */
function stylesFiles(dir: string, pkgName: string, name: string): readonly ScaffoldFile[] {
  return [
    [joinPosix(dir, 'package.json'), renderTemplate('styles/package.json.tmpl', { name: pkgName })],
    [joinPosix(dir, 'README.md'), renderTemplate('styles/README.md.tmpl', { name: pkgName, project: name })],
    [joinPosix(dir, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
    [joinPosix(dir, CONFIG_FILE), renderTemplate('styles/fudic.json.tmpl', {})],
    [joinPosix(dir, 'tokens.css'), renderTemplate('styles/tokens.css.tmpl', { project: name })],
  ];
}

/** What `g lib --styles-only` tells the user (BUG-50 §6.13). */
function stylesReport(name: string, dir: string, projects: readonly Project[], app: string): readonly string[] {
  const lib = projects.find((project) => project.config.kind === 'lib')?.name ?? 'ui';
  const toLib = `fudic add ${name} --project ${lib}`;
  const toApp = `fudic add ${name} --project ${app}`;
  const width = Math.max(toLib.length, toApp.length) + 5;
  return [
    '',
    `Created style library ${name} in ${dir}`,
    '',
    `  tokens.css     global stylesheet, adopted by every component of whoever uses ${name}`,
    '  no components, no tests, no spec',
    '',
    'Use it',
    `  ${toLib.padEnd(width)}a library: its components read the tokens`,
    `  ${toApp.padEnd(width)}an app`,
  ];
}
