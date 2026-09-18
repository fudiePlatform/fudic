/**
 * The project's style guide, from the build's point of view (SDD-42 §3.2).
 *
 * The plugin is the one that owns a filesystem, so it is the plugin that turns the
 * `styles` of `fudic.json` into sheets the emit can hoist. The compiler receives them
 * already read, through `EmitOptions.projectStyles`, and never opens a `.css` — which is
 * the same seam a component's linked assets travel over.
 *
 * Both diagnostics are errors, and the reason is that neither has a correct degraded
 * behaviour. A sheet that is not there and a sheet that cannot be told from another are
 * both a document rendered with styles the author did not write — silently, because a
 * missing stylesheet looks exactly like a stylesheet that did nothing.
 */

import { LineMap, lintProjectStyle, type ProjectStyle } from '@fudic/compiler';
import {
  FUD_STYLE_SPECIFIER_CLASH,
  readProjectConfig,
  readProjectStyles,
  type ConfigDiagnostic,
  type ConfigIo,
  type ProjectConfig,
  type ProjectStyleFile,
} from '@fudic/config';
import { dependencyChain, owningPackage, type PackageFs } from '@fudic/resolve';

export interface StylesResult {
  /** In adoption order. Empty for a project with no `fudic.json` or no `styles`. */
  readonly styles: readonly ProjectStyle[];
  /** Fatal: the document would render with styles nobody declared (§4.1). */
  readonly errors: readonly ConfigDiagnostic[];
  /** `FUD0743`: a rule of the sheet that matches nothing where the sheet goes (§4.5). */
  readonly warnings: readonly ConfigDiagnostic[];
}

/** Resolve and read `<root>/<entry>` for every `styles` entry of the project. */
export function readStyles(
  root: string,
  config: ProjectConfig | null,
  io: ConfigIo,
): StylesResult {
  if (config === null || config.styles.length === 0) {
    return { styles: [], errors: [], warnings: [] };
  }
  const { styles, diagnostics } = readProjectStyles(root, config.styles, io);
  // Only the two the emit needs: the path it was read from is the reader's business, and
  // carrying it further would put a filesystem path inside the compiler's options.
  return {
    styles: styles.map(({ specifier, css }) => ({ specifier, css })),
    errors: diagnostics,
    warnings: styles.flatMap(lintOne),
  };
}

/**
 * The style guides of a build, package by package (SDD-43 §4.6).
 *
 * SDD-42 had one project and therefore one list. With libraries a document composes
 * components from several packages, and each of them adopts the guides of the chain of the
 * package that DEFINES it — the consumer's own sheet does not reach a library's component,
 * which is what stops an app restyling a library it consumes by accident.
 *
 * Everything is cached by package root: a build transforms hundreds of files and the chain of
 * a package is a fact of `package.json` files that does not change while it runs.
 */
export class ProjectStyleChains {
  readonly #root: string;
  readonly #io: PackageFs;
  readonly #config: ConfigIo;
  /** Package root → the sheets it declares itself. */
  readonly #own = new Map<string, StylesResult>();
  /** Package root → its whole chain, dependencies first. */
  readonly #chain = new Map<string, readonly ProjectStyle[]>();
  /** File → the chain of the package that owns it. */
  readonly #ofFile = new Map<string, readonly ProjectStyle[]>();
  readonly #diagnostics: ConfigDiagnostic[] = [];

  constructor(root: string, io: PackageFs) {
    // Under its real name, because that is the spelling `owningPackage` answers with: a
    // build whose root is reached through a symlink would otherwise read its own sheets
    // twice, under two keys, and report what it found about them twice too.
    this.#root = toPosix(io.realPath(toPosix(root)));
    this.#io = io;
    this.#config = {
      exists: (path) => io.readFile(path) !== undefined,
      // `readProjectStyles` asks `exists` first and reads in the same tick, so the two
      // cannot disagree; the assertion is for the type, and a fallback here would be a
      // branch nothing can take.
      read: (path) => io.readFile(path) as string,
    };
  }

  /**
   * The sheets `packageRoot` declares itself, with what reading them had to say.
   *
   * The build root's result is the plugin's to report — it is the project the author is
   * building, and its `FUD0743` is advice about their own file. Another package's problems
   * are collected here instead: they are reported once, naming the package, because the
   * author of an app does not fix a library's stylesheet by editing their own.
   */
  own(packageRoot: string): StylesResult {
    const key = toPosix(this.#io.realPath(toPosix(packageRoot)));
    const cached = this.#own.get(key);
    if (cached !== undefined) return cached;
    const result = readStyles(key, readProjectConfig(key, this.#config).config, this.#config);
    this.#own.set(key, result);
    if (key !== this.#root) this.#diagnostics.push(...result.errors);
    return result;
  }

  /**
   * The sheets a component defined in `file` adopts, in cascade order: the root of its
   * package's dependency chain first, its own package last.
   */
  chainFor(file: string): readonly ProjectStyle[] {
    const key = toPosix(file);
    const cached = this.#ofFile.get(key);
    if (cached !== undefined) return cached;
    const chain = this.chainOfPackage(this.#ownerOf(key));
    this.#ofFile.set(key, chain);
    return chain;
  }

  /**
   * The chain of one PACKAGE by its root: its dependencies' sheets, then its own.
   *
   * Reading the build root's chain reads every fudic package the project declares — which is
   * what makes every sheet of the build, and everything reading them had to say, known before
   * the first module is emitted rather than halfway through the first transform.
   */
  chainOfPackage(packageRoot: string): readonly ProjectStyle[] {
    return this.#chainOf(toPosix(this.#io.realPath(toPosix(packageRoot))));
  }

  /** What reading the OTHER packages' sheets had to say. The root's are `own(root)`'s. */
  get diagnostics(): readonly ConfigDiagnostic[] {
    return this.#diagnostics;
  }

  /**
   * The package a file belongs to — and the build root for anything above it.
   *
   * A file under the root whose nearest `package.json` sits higher (a project that is not an
   * npm package of its own, which is every test root and many real apps) belongs to the
   * project being built: what defines a fudic project is its `fudic.json`, and the root has
   * one. Nothing above the root can describe this project's chain.
   */
  #ownerOf(file: string): string {
    const owner = owningPackage(file, this.#io);
    if (owner === undefined || this.#root.startsWith(`${owner}/`)) return this.#root;
    return owner;
  }

  #chainOf(packageRoot: string): readonly ProjectStyle[] {
    const cached = this.#chain.get(packageRoot);
    if (cached !== undefined) return cached;
    const sheets: ProjectStyle[] = [];
    // Specifier → the package that already contributed it. Two sheets under one specifier
    // cannot be told apart in the module map, and one of them would silently replace the
    // other — the same `FUD0741` `@fudic/config` reports inside one project, across two.
    const claimed = new Map<string, string>();
    for (const pkg of dependencyChain(packageRoot, this.#io)) {
      // By name where it has one, by directory where it does not: a diagnostic has to name
      // something the author can go and look at, and a private package often has no name.
      const by = pkg.name === '' ? pkg.root : pkg.name;
      for (const sheet of this.own(pkg.root).styles) {
        const owner = claimed.get(sheet.specifier);
        if (owner !== undefined) {
          this.#diagnostics.push(clash(sheet.specifier, owner, by));
          continue;
        }
        claimed.set(sheet.specifier, by);
        sheets.push(sheet);
      }
    }
    this.#chain.set(packageRoot, sheets);
    return sheets;
  }
}

/** Two packages of one chain whose sheets adopt under the same specifier. */
function clash(specifier: string, first: string, second: string): ConfigDiagnostic {
  return {
    code: FUD_STYLE_SPECIFIER_CLASH,
    // The file is the OTHER package's `fudic.json`, and naming it as a path relative to this
    // project would be a path into `node_modules` that means nothing to read. The package is
    // what the message names, and it is what the author has to go and talk to.
    file: second,
    message:
      `"${first}" and "${second}" both adopt a stylesheet as "${specifier}". Two sheets with ` +
      'the same basename cannot be told apart in the module map, and one would silently ' +
      'replace the other — rename one of the two files.',
  };
}

/** `\` → `/`: a package root is compared as a string, so one spelling only. */
function toPosix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/**
 * `FUD0743` over one sheet, here and not in the emit.
 *
 * The sheet is handed to every module the build emits, so the same reading repeated there
 * would be one warning per route for one mistake — the reason `FUD0742` sits in the plugin
 * too. Read once, where the file is read.
 *
 * The position is resolved here as well: the compiler speaks in offsets on purpose
 * (SDD-13), and a build log is the one place where that has to become a line and a column
 * the author can click.
 */
function lintOne(file: ProjectStyleFile): readonly ConfigDiagnostic[] {
  const found = lintProjectStyle(file.css);
  if (found.length === 0) return [];
  const lines = new LineMap(file.css);
  return found.map((d) => {
    const at = lines.positionAt(d.span.start);
    return {
      code: d.code,
      message: `${file.entry}:${at.line + 1}:${at.character + 1}: ${d.message}`,
      file: file.entry,
      span: d.span,
    };
  });
}
