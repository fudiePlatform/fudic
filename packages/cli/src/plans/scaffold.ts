/**
 * What every scaffolding command shares: the guard rails it refuses on, and the tree of an
 * app (SDD-22 §6.1, SDD-44 §4.2).
 *
 * It exists so that `fudic new` and `fudic new --workspace` write the SAME app from the same
 * code. Two builders producing "the same" tree is two trees the day one of them gains a file,
 * and criterion 2 — the standalone project unchanged, byte for byte — would then be a test of
 * a copy rather than of the thing it copies.
 */

import { CONFIG_FILE, ID_PATTERN, PREFIX_PATTERN } from '@fudic/config';
import { FUD0443, FUD0447, FUD0725 } from '@fudic/diagnostics';
import { API_TYPES_DIR, BROWSER_DIR, COMPONENTS_DIR, LAYOUTS_DIR, ROUTES_DIR, SERVER_DIR } from '@fudic/conventions';
import { GLOBALS_DTS, GLOBALS_FILE_NAME } from '@fudic/language-core';
import { absolute, hrefBetween, joinPosix } from '../paths.js';
import { FUDIC_VERSION, targetChange, TYPESCRIPT_VERSION, VITE_VERSION, VITEST_VERSION } from '../project.js';
import { layoutTest, pageTest, prefixField, renderSectionBlocks, renderTemplate, viteSettings } from '../templates.js';
import { ENV_DECLARATION, ENV_FILE } from './spec.js';
import type { ReadIo } from '../io.js';
import type { AppLayout, BaseOptions, CliError, FileChange, NewOptions } from '../types.js';

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
  /**
   * The extra `dependencies` entries `--uses` asked for, already rendered (§4.7). `''` for a
   * project that uses nothing, which leaves the `package.json` exactly as it was.
   */
  readonly uses: string;
  /**
   * Where a workspace app is served and the port it takes on its own (BUG-50 §4.5). Absent for
   * a standalone app and for the first app of a workspace: `/` on Vite's port.
   */
  readonly serve?: { readonly base: string; readonly port: number };
}

/** `null` when the field is usable. An empty `prefix` is the field being absent, not a value. */
function invalidField(field: string, value: string, pattern: RegExp): CliError | null {
  if (field === 'prefix' && value === '') return null;
  if (pattern.test(value)) return null;
  return FUD0725({ file: CONFIG_FILE, problem: 'flag', field, value, pattern: pattern.source });
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
    return FUD0447({ target: opts.target, available: AVAILABLE_TARGETS });
  }

  const badField =
    invalidField('id', opts.id, ID_PATTERN) ?? invalidField('prefix', opts.prefix, PREFIX_PATTERN);
  if (badField !== null) return badField;

  const root = absolute(opts.cwd, name);
  if (io.exists(root) && io.list(root).length > 0 && !opts.force) {
    return FUD0443({ file: name, target: 'directory' });
  }
  return null;
}

/**
 * The `.d.ts` the plugin generates from each `.fudapi` (SDD-60 §3.11). Named in the `include`
 * because `**` never walks into a dot folder: without it the handlers in `src/server` cannot
 * see `fudic:<id>`.
 */
const API_TYPES_GLOB = `${API_TYPES_DIR}/**/*.d.ts`;

/** What keeps an empty folder in git. */
const KEEP = '.gitkeep';

/** The `tsconfig.json` of a project: its own, or the workspace base plus an `include`. */
export function tsconfigFor(site: ProjectSite): string {
  if (site.up === null) return renderTemplate('tsconfig.json.tmpl', { apiTypes: API_TYPES_GLOB });
  return renderTemplate('workspace/tsconfig.project.json.tmpl', {
    apiTypes: API_TYPES_GLOB,
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
  const indexFile = joinPosix(site.dir, ROUTES_DIR, 'index.fud');
  const frame = frameOf(site.dir, opts.layout, indexFile);

  return [
    [
      joinPosix(site.dir, 'package.json'),
      renderTemplate('package.json.tmpl', {
        name: site.pkgName,
        version: FUDIC_VERSION,
        viteVersion: VITE_VERSION,
        vitestVersion: VITEST_VERSION,
        tsVersion: TYPESCRIPT_VERSION,
        uses: site.uses,
      }),
    ],
    [
      joinPosix(site.dir, 'vite.config.ts'),
      renderTemplate('vite.config.ts.tmpl', {
        routesDir: ROUTES_DIR,
        settings: site.serve === undefined ? '' : viteSettings(site.serve.base, site.serve.port),
      }),
    ],
    ...testingFiles(site.dir),
    [
      joinPosix(site.dir, 'README.md'),
      renderTemplate('README.md.tmpl', {
        name: site.pkgName,
        run: runCommand(site, opts.pm),
        prefix: opts.prefix,
        frame: frameLine(frame),
        routesDir: ROUTES_DIR,
        componentsDir: COMPONENTS_DIR,
      }),
    ],
    [joinPosix(site.dir, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
    [
      joinPosix(site.dir, CONFIG_FILE),
      renderTemplate('fudic.json.tmpl', {
        id: opts.id,
        prefix: prefixField(opts.prefix),
        server: SERVER_DIR,
        browser: BROWSER_DIR,
      }),
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
    ...(frame.own === null
      ? []
      : ([
          [
            joinPosix(site.dir, LAYOUTS_DIR, `${frame.own}.fud`),
            renderTemplate('layout.fud', {
              lang: 'en',
              renderHead: '    @RenderHead()',
              sections: renderSectionBlocks([]),
            }),
          ],
          [joinPosix(site.dir, LAYOUTS_DIR, `${frame.own}.test.ts`), layoutTest(`${frame.own}.fud`)],
        ] as const)),
    [
      indexFile,
      frame.href === null
        ? renderTemplate('page.fud', { lang: 'en', title: 'Home', code: '' })
        : renderTemplate('route.fud', { layoutHref: frame.href, code: '', title: 'Home', sections: '' }),
    ],
    [joinPosix(site.dir, ROUTES_DIR, 'index.test.ts'), pageTest('/')],
    // Where the handlers of the `.fudapi` go, and the halves that run in the browser
    // (SDD-60 §3.15): empty, and named in `fudic.json` so moving them is one line.
    [joinPosix(site.dir, SERVER_DIR, KEEP), ''],
    [joinPosix(site.dir, BROWSER_DIR, KEEP), ''],
  ];
}

/** What frames an app's pages: the name of its own layout, if any, and the href its home links. */
interface Frame {
  readonly own: string | null;
  readonly href: string | null;
}

function frameOf(dir: string, layout: AppLayout, indexFile: string): Frame {
  if (layout === null) return { own: null, href: null };
  if ('href' in layout) return { own: null, href: layout.href };
  return { own: layout.own, href: hrefBetween(indexFile, joinPosix(dir, LAYOUTS_DIR, `${layout.own}.fud`)) };
}

/** The README's line about the frame of the pages. */
function frameLine(frame: Frame): string {
  if (frame.own !== null) {
    return `- \`${LAYOUTS_DIR}/${frame.own}.fud\`: the frame every page is written into, and \`${frame.own}.test.ts\` its unit test.`;
  }
  if (frame.href !== null) return `- \`${frame.href}\`: the layout every page is written into; it is not this app's.`;
  return '- No layout: each page is a whole document. `fudic g layout <name>` adds one.';
}

/**
 * What lets a project — an app or a library — run its unit tests and its `.fudspec` criteria
 * from the first minute (BUG-50 §4.2): the vitest config, and the declaration that lets a test
 * or a fixture import a `.fud`.
 */
export function testingFiles(dir: string): readonly ScaffoldFile[] {
  return [
    [joinPosix(dir, 'vitest.config.ts'), renderTemplate('vitest.config.ts.tmpl', {})],
    [joinPosix(dir, ENV_FILE), ENV_DECLARATION],
  ];
}

/**
 * How the README says to run a script of the app: on its own, with its package manager; in a
 * workspace, from the root with a filter, because the install belongs to the workspace.
 */
function runCommand(site: ProjectSite, pm: string): string {
  if (site.up === null) return `${pm} run`;
  return `pnpm --filter ${site.dir.slice(site.dir.lastIndexOf('/') + 1)}`;
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
