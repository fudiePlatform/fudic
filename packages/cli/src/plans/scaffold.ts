/**
 * What every scaffolding command shares: the guard rails it refuses on, and the tree of an
 * app (SDD-22 §6.1, SDD-44 §4.2).
 *
 * It exists so that `fudic new` and `fudic new --workspace` write the SAME app from the same
 * code. Two builders producing "the same" tree is two trees the day one of them gains a file,
 * and criterion 2 — the standalone project unchanged, byte for byte — would then be a test of
 * a copy rather than of the thing it copies.
 */

import { CONFIG_FILE, FUD_CONFIG_MALFORMED, ID_PATTERN, PREFIX_PATTERN } from '@fudic/config';
import { COMPONENTS_DIR, LAYOUTS_DIR, ROUTES_DIR } from '@fudic/conventions';
import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import { cliError, FUD_ADAPTER_UNAVAILABLE, FUD_TARGET_EXISTS } from '../diagnostics.js';
import { absolute, hrefBetween, joinPosix } from '../paths.js';
import { FUDIC_VERSION, targetChange, TYPESCRIPT_VERSION, VITE_VERSION } from '../project.js';
import { prefixField, renderSectionBlocks, renderTemplate } from '../templates.js';
import type { ReadIo } from '../io.js';
import type { BaseOptions, CliError, FileChange, NewOptions } from '../types.js';

/** The only adapter that exists: none. Anything else is rejected, never ignored (§4.6). */
export const AVAILABLE_TARGETS = ['static'];

/** One file of a scaffold: where it goes, and what is in it. */
export type ScaffoldFile = readonly [string, string];

/** Where a project tree hangs, and what it is called once it is there. */
export interface ProjectSite {
  /** The directory the tree hangs from, relative to `cwd`. */
  readonly dir: string;
  /** The npm name written into its `package.json`. */
  readonly pkgName: string;
  /**
   * The relative path from `dir` up to the workspace root, or `null` for a standalone
   * project.
   *
   * It decides the two files §4.6 keeps in exactly one place: the ambient declarations and
   * the strict TypeScript config. N copies of a generated file is N places that diverge the
   * day `GLOBALS_DTS` changes version, and the "do not edit" banner does not protect against
   * that.
   */
  readonly up: string | null;
}

/** `null` when the field is usable. An empty `prefix` is the field being absent, not a value. */
function invalidField(field: string, value: string, pattern: RegExp): CliError | null {
  if (field === 'prefix' && value === '') return null;
  if (pattern.test(value)) return null;
  return cliError(
    FUD_CONFIG_MALFORMED,
    `--${field} "${value}" is not usable in ${CONFIG_FILE}: it must match ${pattern.source}`,
    CONFIG_FILE,
  );
}

/**
 * The single error that makes a scaffold refuse to run, or `null`.
 *
 * The config fields are checked BEFORE anything is written, because the command refuses to
 * write a `fudic.json` its own reader would reject: a project whose id does not match is one
 * whose build fails on its first run, with a diagnostic about a file the user never opened.
 */
export function scaffoldRefusal(
  name: string,
  opts: NewOptions,
  io: ReadIo,
): CliError | null {
  if (!AVAILABLE_TARGETS.includes(opts.target)) {
    return cliError(
      FUD_ADAPTER_UNAVAILABLE,
      `adapter '${opts.target}' is not available; installed adapters: ${AVAILABLE_TARGETS.join(', ')}`,
    );
  }

  const badField =
    invalidField('id', opts.id, ID_PATTERN) ?? invalidField('prefix', opts.prefix, PREFIX_PATTERN);
  if (badField !== null) return badField;

  const root = absolute(opts.cwd, name);
  if (io.exists(root) && io.list(root).length > 0 && !opts.force) {
    return cliError(
      FUD_TARGET_EXISTS,
      `${name} already exists and is not empty; pass --force to overwrite`,
      name,
    );
  }
  return null;
}

/** The `tsconfig.json` of a project: its own, or the workspace base plus an `include`. */
export function tsconfigFor(site: ProjectSite): string {
  if (site.up === null) return renderTemplate('tsconfig.json.tmpl', {});
  return renderTemplate('workspace/tsconfig.project.json.tmpl', {
    base: `${site.up}/tsconfig.base.json`,
    globals: `${site.up}/${GLOBALS_FILE_NAME}`,
  });
}

/**
 * The tree of an app: the tooling files in its root, the layout, and a root route wired to
 * it with `<link rel="layout">`.
 *
 * The Service Worker itself is NOT among them: the plugin emits `fudic-sw.js`, and the
 * project only declares the policy (SDD-20 §4.7).
 */
export function appFiles(site: ProjectSite, opts: NewOptions): readonly ScaffoldFile[] {
  const layoutFile = joinPosix(site.dir, LAYOUTS_DIR, `${opts.layout}.fud`);
  const indexFile = joinPosix(site.dir, ROUTES_DIR, 'index.fud');

  return [
    [
      joinPosix(site.dir, 'package.json'),
      renderTemplate('package.json.tmpl', {
        name: site.pkgName,
        version: FUDIC_VERSION,
        viteVersion: VITE_VERSION,
        tsVersion: TYPESCRIPT_VERSION,
      }),
    ],
    [
      joinPosix(site.dir, 'vite.config.ts'),
      renderTemplate('vite.config.ts.tmpl', { routesDir: ROUTES_DIR }),
    ],
    [
      joinPosix(site.dir, 'README.md'),
      renderTemplate('README.md.tmpl', {
        name: site.pkgName,
        pm: opts.pm,
        layout: opts.layout,
        layoutsDir: LAYOUTS_DIR,
        routesDir: ROUTES_DIR,
        componentsDir: COMPONENTS_DIR,
      }),
    ],
    [joinPosix(site.dir, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
    [
      joinPosix(site.dir, CONFIG_FILE),
      renderTemplate('fudic.json.tmpl', { id: opts.id, prefix: prefixField(opts.prefix) }),
    ],
    [joinPosix(site.dir, 'tsconfig.json'), tsconfigFor(site)],
    // The ambient declarations the templates are typed against, written from the same
    // constant the language server mounts in memory (SDD-23 §3.3), so the editor and `tsc`
    // can never disagree about what `props<T>()` or `$text` mean. Inside a workspace they
    // are at the root instead, once (§4.6).
    ...(site.up === null
      ? ([[joinPosix(site.dir, GLOBALS_FILE_NAME), GLOBALS_DTS]] as const)
      : []),
    ...(opts.sw
      ? ([[joinPosix(site.dir, 'sw.json'), renderTemplate('sw.json.tmpl', {})]] as const)
      : []),
    [
      layoutFile,
      renderTemplate('layout.fud', {
        lang: 'en',
        renderHead: '    @RenderHead()',
        sections: renderSectionBlocks([]),
      }),
    ],
    [
      indexFile,
      renderTemplate('route.fud', {
        layoutHref: hrefBetween(indexFile, layoutFile),
        code: '',
        title: 'Home',
        sections: '',
      }),
    ],
  ];
}

export interface ScaffoldChanges {
  readonly changes: readonly FileChange[];
  readonly errors: readonly CliError[];
}

/**
 * Every file of a scaffold, turned into a change.
 *
 * Collisions are COLLECTED rather than thrown on the first one: a plan with errors is never
 * applied, so reporting one file at a time would make the user rerun the command once per
 * file to discover what is in the way.
 */
export function scaffoldChanges(
  opts: BaseOptions,
  files: readonly ScaffoldFile[],
  io: ReadIo,
): ScaffoldChanges {
  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  for (const [file, contents] of files) {
    const target = targetChange(opts.cwd, file, contents, opts.force, io);
    if (target.error !== undefined) errors.push(target.error);
    if (target.change !== undefined) changes.push(target.change);
  }
  return { changes, errors };
}
