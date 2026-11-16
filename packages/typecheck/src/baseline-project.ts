/**
 * What Baseline says of a project as a whole (SDD-83 §3.4, §3.8, §4.1): what no single file can.
 *
 * - `FUD1526`, one per library: an app's detectors also read the files of each library it uses,
 *   against the app's level and `allow`. What the library guards (`@supports`, detection) is not a
 *   use, as anywhere else.
 * - `FUD1528`, one per id of `allow` that nothing of the project uses — its own files and its
 *   libraries' alike: the app allows a feature for whoever writes it.
 *
 * Both land on the `fudic.json` of the project: `FUD1526` on `"baseline"`, `FUD1528` on the id.
 * The check and the editor (opening the `fudic.json`) call the same functions, so they say the same.
 *
 * A package is read whole: the markup, the `<style>` and the `@code` of its `.fud`, the modules the
 * browser loads (what those import, its `browser` folder and its pipes, never `server`), and its
 * sheets — `globalStyles`, `styles` and the guide with everything it imports. Nothing is read
 * that is not needed: a project without libraries and without `allow` costs nothing here.
 *
 * Type-only import of `typescript`, as in `baseline`: the language server bundles this file.
 */

import { posix } from 'node:path';
import type * as ts from 'typescript';
import { status } from '@fudic/baseline';
import {
  cssBaselineUses,
  documentRoots,
  flattenImports,
  htmlBaselineUses,
  judgeUse,
  styleBaselineUses,
  type BaselineUse,
} from '@fudic/compiler';
import { baselineContextOf, CONFIG_FILE, type ProjectConfig } from '@fudic/config';
import { BROWSER_DIR, PIPES_DIR, SERVER_DIR } from '@fudic/conventions';
import { FUD1526, FUD1528, type FileDiagnostic, type Span } from '@fudic/diagnostics';
import { browserModules, fudBaselineUses, moduleBaselineUses } from './baseline.js';
import type { ProjectedFud } from './project.js';

/** Where a package is read from: the program that holds its code, and the disk for its folders and sheets. */
export interface BaselineSite {
  readonly typescript: typeof ts;
  readonly program: ts.Program;
  readFile(path: string): string | undefined;
}

/** One package to read: the project itself, or a library it uses. */
export interface BaselinePackage {
  /** Absolute POSIX path of its root. */
  readonly root: string;
  /** Its `fudic.json`; null when it has none or it is unusable, and then its folders are the conventions. */
  readonly config: ProjectConfig | null;
  /** Its `.fud`, projected. */
  readonly fuds: readonly ProjectedFud[];
}

/** A library of the app, by the name its `package.json` gives it, read only when asked. */
export interface BaselineLibrary {
  readonly name: string;
  uses(): readonly BaselineUse[];
}

/** Everything `pkg` uses of the browser, unguarded: its `.fud`, the modules the browser loads and its sheets. */
export function packageBaselineUses(site: BaselineSite, pkg: BaselinePackage): readonly BaselineUse[] {
  const uses: BaselineUse[] = [];
  for (const fud of pkg.fuds) {
    const roots = documentRoots(fud.document);
    uses.push(...htmlBaselineUses(roots), ...styleBaselineUses(roots, fud.source), ...fudBaselineUses(site.program, fud));
  }
  for (const file of packageModules(site, pkg)) uses.push(...moduleBaselineUses(site.program, file));
  for (const css of packageSheets(site, pkg)) uses.push(...cssBaselineUses(css));
  return uses;
}

/** The modules of `pkg` the browser loads (§3.6): what its `.fud`, its `browser` folder and its pipes import. */
export function packageModules(site: BaselineSite, pkg: BaselinePackage): readonly string[] {
  const folder = (dir: string): string[] =>
    site.typescript.sys
      .readDirectory(`${pkg.root}/${dir}`, ['.ts', '.mts', '.js', '.mjs'], ['**/node_modules/**'], ['**/*'])
      .map((path) => path.replace(/\\/gu, '/'));
  const roots = [
    ...pkg.fuds.map((fud) => fud.path),
    ...folder(pkg.config?.browser ?? BROWSER_DIR),
    ...folder(pkg.config?.pipes ?? PIPES_DIR),
  ];
  return browserModules(site.typescript, site.program, roots, pkg.root, `${pkg.root}/${pkg.config?.server ?? SERVER_DIR}`);
}

/** The text of every sheet `pkg` declares: `globalStyles`, `styles`, and its guide with what it imports. */
function packageSheets(site: BaselineSite, pkg: BaselinePackage): readonly string[] {
  const config = pkg.config;
  if (config === null) return [];
  const files = new Set([...config.globalStyles, ...config.styles].map((style) => posix.join(pkg.root, style.path)));
  if (config.guide !== undefined) {
    const read = (spec: string): string | undefined => site.readFile(posix.join(pkg.root, spec));
    const sheet = `./${config.guide.sheet}`;
    const flat = flattenImports(sheet, read(sheet) ?? '', (spec) => read(spec) ?? null);
    for (const file of flat.files) files.add(posix.join(pkg.root, file));
  }
  return [...files].flatMap((file) => {
    const css = site.readFile(file);
    return css === undefined ? [] : [css];
  });
}

/**
 * `FUD1526` for each library of an app that uses, unguarded, what the app's Baseline does not
 * accept, and `FUD1528` for each id of `allow` that nothing uses. `own` is what the project's own
 * files use; both it and each library are read only if a warning could come of them.
 */
export function projectBaselineDiagnostics(
  config: ProjectConfig,
  own: () => readonly BaselineUse[],
  libraries: readonly BaselineLibrary[],
  asOf?: string,
): readonly FileDiagnostic[] {
  const context = { ...baselineContextOf(config), ...(asOf === undefined ? {} : { asOf }) };
  const out: FileDiagnostic[] = [];
  const read = new Map<BaselineLibrary, readonly BaselineUse[]>();
  const usesOf = (library: BaselineLibrary): readonly BaselineUse[] => {
    let uses = read.get(library);
    if (uses === undefined) read.set(library, (uses = library.uses()));
    return uses;
  };

  // A library imposes nothing on another library: only an app compiles them all (§3.8).
  if (config.kind === 'app') {
    for (const library of libraries) {
      // `judgeUse` refuses only keys the table has, so each one has a status.
      const failing = usesOf(library).filter((use) => judgeUse(use, context) !== undefined);
      const features = [...new Set(failing.map((use) => status(use.key)!.feature))].sort();
      if (features.length > 0) out.push(FUD1526({ ...at(config.baseline.span), library: library.name, features }));
    }
  }

  if (config.baseline.allow.length > 0) {
    const used = new Set(
      [...own(), ...libraries.flatMap(usesOf)].flatMap((use) => status(use.key)?.features ?? []),
    );
    for (const entry of config.baseline.allow) {
      if (!entry.features.some((feature) => used.has(feature))) out.push(FUD1528({ ...at(entry.span), id: entry.id }));
    }
  }
  return out;
}

/** The file and, when it is known, the span of something written in the `fudic.json`. */
function at(span: Span | undefined): { readonly file: string; readonly span?: Span } {
  return span === undefined ? { file: CONFIG_FILE } : { file: CONFIG_FILE, span };
}
