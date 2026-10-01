/**
 * The `@import`s of a document sheet, flattened (SDD-49 §3.3, §4.2).
 *
 * A style guide is written as one file per subject — reset, colour tokens, spacing tokens,
 * typography, forms — gathered with `@import` in a main sheet. The page receives that main
 * sheet pruned, and a prune that cannot see past an `@import` keeps exactly what weighs. So
 * before pruning, every relative `@import` is replaced by the file it names, recursively, in
 * the cascade order the browser would give the original:
 *
 * - its conditions become blocks, outermost first: `layer`, `supports`, `media`;
 * - an `@import` after a rule is one the browser ignores (`FUD0857`), so it goes;
 * - a file imported twice with the same conditions stays once, at its LAST appearance — the
 *   one that wins the cascade — unless it declares layers, whose order its first sets;
 * - a cycle (`FUD0856`) and a file that is not there (`FUD0853`) drop the `@import`;
 * - an `@import` that cannot be flattened — absolute, another origin, `public/` — stays, hoisted
 *   to the top where the browser honours it (`FUD0850`), and says so when that reorders the
 *   cascade (`FUD0858`).
 *
 * Every relative `url()` is rewritten relative to the compiled `.fud` — the coordinate system
 * every specifier here is in — so a font named from a file two folders away is still found,
 * whichever file it ends up written in.
 *
 * The compiler has no filesystem: files are read through the host's port (`CssRead`), the same
 * one `?inline` uses. Every diagnostic is over the file it is about, and every offset of the
 * flattened text maps back to its file (`originOf`). It never throws.
 */

import type { Diagnostic, Span } from '../types/index.js';
import { span } from '../types/index.js';
import { FUD0850, FUD0853, FUD0856, FUD0857, FUD0858 } from '@fudic/diagnostics';
import { parseCssRules, type CssRule } from './rules.js';

/** The prelude of an `@import`, read. */
export interface CssImport {
  /** As written, without quotes or `url()`. */
  readonly url: string;
  /** Over the prelude. */
  readonly urlSpan: Span;
  /** `layer` → `''` (an anonymous layer); `layer(x)` → `'x'`; absent when there is none. */
  readonly layer?: string;
  /** What `supports(…)` holds. */
  readonly supports?: string;
  /** The media query list, when there is one. */
  readonly media?: string;
}

/**
 * The host's reader — the port `?inline` uses (`AssetText`): the text of a file given as a
 * specifier relative to the `.fud`, or `null` when it is not there or cannot be read.
 */
export type CssRead = (spec: string) => string | null;

/** A stretch of the flattened sheet and the file it came from. */
export interface FlatRegion {
  /** Over the flattened text. */
  readonly flat: Span;
  /** The file's specifier, relative to the `.fud`. */
  readonly file: string;
  /** Where `flat.start` falls in that file. */
  readonly offset: number;
}

export interface FileDiagnostic {
  readonly file: string;
  /** Its span is over the text of `file`. */
  readonly diagnostic: Diagnostic;
}

/** Where a file entered the sheet: the `@import` that first named it, in the file that wrote it. */
export interface ImportSite {
  /** The importing file's specifier, relative to the `.fud`. */
  readonly file: string;
  /** Over the whole `@import` rule, in the importing file's text. */
  readonly span: Span;
}

export interface FlatSheet {
  readonly css: string;
  readonly regions: readonly FlatRegion[];
  /** Every file read, the root first: what the host watches (§4.10). */
  readonly files: readonly string[];
  readonly diagnostics: readonly FileDiagnostic[];
  /**
   * Every file but the root, by the `@import` that first brought it in: where an author goes
   * to remove one nobody uses (`FUD0852`). Absent for a `plainSheet`, which reads no imports.
   */
  readonly importedAt?: ReadonlyMap<string, ImportSite>;
}

// ---------------------------------------------------------------------------
// The prelude
// ---------------------------------------------------------------------------

const SPACE = /\s/u;

/** The index just past the `)` that closes the `(` at `open`, or `-1` when it never does. */
function closeParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = text.indexOf(ch, i + 1);
      if (end === -1) return -1;
      i = end;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function skipSpace(text: string, i: number): number {
  while (i < text.length && SPACE.test(text[i]!)) i += 1;
  return i;
}

/** The URL at `i`: a string, or `url(…)` with or without quotes. */
function readUrl(prelude: string, i: number): { url: string; span: Span; end: number } | null {
  const ch = prelude[i];
  if (ch === '"' || ch === "'") {
    const end = prelude.indexOf(ch, i + 1);
    if (end === -1) return null;
    return { url: prelude.slice(i + 1, end), span: span(i + 1, end), end: end + 1 };
  }
  if (!/^url\(/iu.test(prelude.slice(i))) return null;
  const close = closeParen(prelude, i + 3);
  if (close === -1) return null;
  let start = skipSpace(prelude, i + 4);
  let end = close - 1;
  while (end > start && SPACE.test(prelude[end - 1]!)) end -= 1;
  const q = prelude[start];
  if ((q === '"' || q === "'") && end - start >= 2 && prelude[end - 1] === q) {
    start += 1;
    end -= 1;
  }
  if (end <= start) return null;
  return { url: prelude.slice(start, end), span: span(start, end), end: close };
}

/** `null` when the prelude is not a valid `@import`: the browser ignores it, and it goes. */
export function parseImport(prelude: string): CssImport | null {
  let i = skipSpace(prelude, 0);
  const url = readUrl(prelude, i);
  if (url === null) return null;
  i = skipSpace(prelude, url.end);
  let layer: string | undefined;
  let supports: string | undefined;
  if (/^layer\b/iu.test(prelude.slice(i))) {
    if (prelude[i + 5] === '(') {
      const close = closeParen(prelude, i + 5);
      if (close === -1) return null;
      layer = prelude.slice(i + 6, close - 1).trim();
      if (layer === '') return null;
      i = close;
    } else {
      layer = '';
      i += 5;
    }
    i = skipSpace(prelude, i);
  }
  if (/^supports\(/iu.test(prelude.slice(i))) {
    const close = closeParen(prelude, i + 8);
    if (close === -1) return null;
    supports = prelude.slice(i + 9, close - 1).trim();
    i = skipSpace(prelude, close);
  }
  const media = prelude.slice(i).trim();
  if (/^(layer|supports)\(/iu.test(media)) return null;
  return {
    url: url.url,
    urlSpan: url.span,
    ...(layer === undefined ? {} : { layer }),
    ...(supports === undefined ? {} : { supports }),
    ...(media === '' ? {} : { media }),
  };
}

// ---------------------------------------------------------------------------
// Specifiers
// ---------------------------------------------------------------------------

/** A URL the host can be asked to read: relative, with no scheme and not root-absolute. */
function isRelative(url: string): boolean {
  if (url === '' || url.startsWith('/') || url.startsWith('#')) return false;
  return !/^[a-z][a-z0-9+.-]*:/iu.test(url);
}

/** The path segments of a specifier, normalised: `.` gone, `..` folded where it can be. */
function segments(path: string): string[] {
  const out: string[] = [];
  for (const seg of path.replace(/\\/gu, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop();
    else out.push(seg);
  }
  return out;
}

/** A specifier without its `?query` or `#fragment`. */
function pathOf(spec: string): string {
  const cut = spec.search(/[?#]/u);
  return cut === -1 ? spec : spec.slice(0, cut);
}

/** `url`, written in the file `from`, as a specifier relative to the `.fud`. */
export function joinSpec(from: string, url: string): string {
  const dir = segments(pathOf(from));
  dir.pop();
  const cut = url.search(/[?#]/u);
  const suffix = cut === -1 ? '' : url.slice(cut);
  const joined = segments([...dir, pathOf(url)].join('/')).join('/');
  return (joined.startsWith('..') ? joined : `./${joined}`) + suffix;
}

// ---------------------------------------------------------------------------
// The flattening
// ---------------------------------------------------------------------------

const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/giu;

/** A file read and parsed once, whatever number of times it is imported. */
interface ParsedFile {
  readonly spec: string;
  readonly text: string;
  readonly rules: readonly CssRule[];
  /** It declares or opens a layer: every appearance of it stays. */
  readonly layered: boolean;
}

/** One appearance of a file in the import tree. */
interface Occurrence {
  readonly file: ParsedFile;
  /** File and conditions: two appearances with the same key are the same import. */
  readonly key: string;
  readonly children: Map<CssRule, Occurrence>;
}

/** Whether a rule tree declares or opens a layer, at any depth. */
function hasLayer(rules: readonly CssRule[]): boolean {
  return rules.some(
    (r) =>
      r.type === 'style-rule'
        ? hasLayer(r.children)
        : r.name === 'layer' || (r.type === 'at-block' && r.children !== undefined && hasLayer(r.children)),
  );
}

class Flattener {
  readonly #read: CssRead;
  readonly #parsed = new Map<string, ParsedFile | null>();
  readonly #files: string[] = [];
  readonly #importedAt = new Map<string, ImportSite>();
  readonly #diagnostics: FileDiagnostic[] = [];
  /** The last appearance of each key, in document order: any earlier one is skipped. */
  readonly #last = new Map<string, Occurrence>();
  #css = '';
  readonly #regions: FlatRegion[] = [];
  /** The `@import`s that cannot be flattened, hoisted in order. */
  readonly #hoisted: { readonly text: string; readonly file: string; readonly offset: number }[] = [];
  /** A flattened `@import` has been written: an external one after it moves ahead of it. */
  #flattenedOne = false;

  constructor(read: CssRead) {
    this.#read = read;
  }

  /** Once per file and place: a file imported twice says what it has to say once. */
  readonly #reported = new Set<string>();

  #report(file: string, diagnostic: Diagnostic): void {
    const id = `${file}|${diagnostic.code}|${diagnostic.span.start}`;
    if (this.#reported.has(id)) return;
    this.#reported.add(id);
    this.#diagnostics.push({ file, diagnostic });
  }

  /** The root: its text is in hand, and it is registered so a file importing it is a cycle. */
  root(spec: string, text: string): ParsedFile {
    const rules = parseCssRules(text).value.rules;
    const file: ParsedFile = { spec, text, rules, layered: hasLayer(rules) };
    this.#parsed.set(spec, file);
    this.#files.push(spec);
    return file;
  }

  /** The file `spec`, read and parsed, or `null` when the host cannot read it. */
  #file(spec: string): ParsedFile | null {
    if (this.#parsed.has(spec)) return this.#parsed.get(spec)!;
    const css = this.#read(spec);
    if (css === null) {
      this.#parsed.set(spec, null);
      return null;
    }
    this.#files.push(spec);
    const rules = parseCssRules(css).value.rules;
    const file: ParsedFile = { spec, text: css, rules, layered: hasLayer(rules) };
    this.#parsed.set(spec, file);
    return file;
  }

  /**
   * The import tree under `file`, with the diagnostics of its `@import`s — reported once per
   * file, however many times it is imported. `stack` holds the files being expanded, for
   * cycles.
   */
  tree(file: ParsedFile, key: string, stack: readonly string[]): Occurrence {
    const occurrence: Occurrence = { file, key, children: new Map() };
    let content = false;
    for (const rule of file.rules) {
      if (rule.type !== 'at-statement' || rule.name !== 'import') {
        if (!(rule.type === 'at-statement' && (rule.name === 'charset' || rule.name === 'layer'))) {
          content = true;
        }
        continue;
      }
      if (content) {
        this.#misplaced(file, rule);
        continue;
      }
      const imp = parseImport(file.text.slice(rule.prelude.start, rule.prelude.end));
      if (imp === null || !isRelative(imp.url)) continue;
      const spec = joinSpec(file.spec, imp.url);
      if (stack.includes(spec) || spec === file.spec) {
        this.#report(file.spec, FUD0856({ span: rule.span, url: imp.url }));
        continue;
      }
      const child = this.#file(spec);
      if (child === null) {
        this.#report(file.spec, FUD0853({ span: rule.span, url: imp.url }));
        continue;
      }
      if (!this.#importedAt.has(spec)) this.#importedAt.set(spec, { file: file.spec, span: rule.span });
      const childKey = `${spec}|${imp.layer ?? '-'}|${imp.supports ?? '-'}|${imp.media ?? '-'}`;
      occurrence.children.set(rule, this.tree(child, childKey, [...stack, file.spec]));
    }
    return occurrence;
  }

  #misplaced(file: ParsedFile, rule: CssRule): void {
    this.#report(file.spec, FUD0857({ span: rule.span }));
  }

  /** Append text from `file`, starting at `offset` there. */
  #emit(text: string, file: string, offset: number): void {
    if (text === '') return;
    this.#regions.push({ flat: span(this.#css.length, this.#css.length + text.length), file, offset });
    this.#css += text;
  }

  /** A stretch of `file`'s text, with every relative `url()` rewritten relative to the `.fud`. */
  #copy(file: ParsedFile, start: number, end: number): void {
    const text = file.text.slice(start, end);
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      const url = m[2]!;
      if (!isRelative(url)) continue;
      const at = m.index;
      this.#emit(text.slice(last, at), file.spec, start + last);
      this.#emit(`url(${m[1]}${joinSpec(file.spec, url)}${m[1]})`, file.spec, start + at);
      last = at + m[0].length;
    }
    this.#emit(text.slice(last), file.spec, start + last);
  }

  /** Record, in document order, the last appearance of every import of the tree. */
  last(occ: Occurrence): Occurrence {
    this.#last.set(occ.key, occ);
    for (const child of occ.children.values()) this.last(child);
    return occ;
  }

  /** Write one occurrence: its text, with each `@import` replaced by what it brings. */
  write(occ: Occurrence, root: boolean): void {
    const { file } = occ;
    let at = 0;
    let content = false;
    for (const rule of file.rules) {
      const isImport = rule.type === 'at-statement' && rule.name === 'import';
      if (!isImport) {
        if (rule.type === 'at-statement' && rule.name === 'charset') {
          // Only the root's counts, and it is written first by the caller.
          this.#copy(file, at, rule.span.start);
          at = rule.span.end;
          continue;
        }
        if (!(rule.type === 'at-statement' && rule.name === 'layer')) content = true;
        continue;
      }
      this.#copy(file, at, rule.span.start);
      at = rule.span.end;
      if (content) continue; // misplaced: reported in `tree`, dropped here
      const prelude = file.text.slice(rule.prelude.start, rule.prelude.end);
      const imp = parseImport(prelude);
      if (imp === null) continue;
      if (!isRelative(imp.url)) {
        this.#external(file, rule, prelude, root);
        continue;
      }
      const child = occ.children.get(rule);
      if (child === undefined) continue; // a cycle or a missing file: reported in `tree`
      this.#flattenedOne = true;
      // Not the last appearance of this import: the last one wins the cascade.
      if (!child.file.layered && this.#last.get(child.key) !== child) continue;
      const open =
        (imp.layer === undefined ? '' : imp.layer === '' ? '@layer{' : `@layer ${imp.layer}{`) +
        (imp.supports === undefined ? '' : `@supports (${imp.supports}){`) +
        (imp.media === undefined ? '' : `@media ${imp.media}{`);
      const depth =
        (imp.layer === undefined ? 0 : 1) +
        (imp.supports === undefined ? 0 : 1) +
        (imp.media === undefined ? 0 : 1);
      this.#emit(open, file.spec, rule.span.start);
      this.write(child, false);
      this.#emit('}'.repeat(depth), file.spec, rule.span.end);
    }
    this.#copy(file, at, file.text.length);
  }

  #external(file: ParsedFile, rule: CssRule, prelude: string, root: boolean): void {
    this.#report(file.spec, FUD0850({ span: rule.span }));
    if (!root || this.#flattenedOne) {
      this.#report(file.spec, FUD0858({ span: rule.span }));
    }
    const text = `@import ${prelude.trim()};`;
    if (!this.#hoisted.some((h) => h.text === text)) {
      this.#hoisted.push({ text, file: file.spec, offset: rule.span.start });
    }
  }

  result(root: ParsedFile): FlatSheet {
    // The root's `@charset` first, then the hoisted imports, then the rest — the only order
    // in which the browser honours each.
    const charset = root.rules.find((r) => r.type === 'at-statement' && r.name === 'charset');
    const body = this.#css;
    const bodyRegions = this.#regions.splice(0);
    this.#css = '';
    if (charset !== undefined) {
      this.#emit(root.text.slice(charset.span.start, charset.span.end), root.spec, charset.span.start);
    }
    for (const h of this.#hoisted) this.#emit(h.text, h.file, h.offset);
    const shift = this.#css.length;
    for (const r of bodyRegions) {
      this.#regions.push({ ...r, flat: span(r.flat.start + shift, r.flat.end + shift) });
    }
    this.#css += body;
    return {
      css: this.#css,
      regions: this.#regions,
      files: this.#files,
      diagnostics: this.#diagnostics,
      importedAt: this.#importedAt,
    };
  }
}

/**
 * The sheet `spec` — relative to the `.fud`, its `?query` ignored — with every relative
 * `@import` replaced by the file it names. `css` is its text. Never throws.
 */
export function flattenImports(spec: string, css: string, read: CssRead): FlatSheet {
  const rootSpec = joinSpec('./x', pathOf(spec));
  const flattener = new Flattener(read);
  const root = flattener.root(rootSpec, css);
  flattener.write(flattener.last(flattener.tree(root, rootSpec, [])), true);
  return flattener.result(root);
}

/** A sheet of one file and no imports: a project sheet, as the prune takes it. */
export function plainSheet(file: string, css: string): FlatSheet {
  return {
    css,
    regions: css === '' ? [] : [{ flat: span(0, css.length), file, offset: 0 }],
    files: [file],
    diagnostics: [],
  };
}

/** An offset of the flattened text, back in its file. */
export function originOf(sheet: FlatSheet, offset: number): { file: string; offset: number } {
  let found: FlatRegion | undefined;
  for (const r of sheet.regions) {
    if (r.flat.start > offset) break;
    found = r;
  }
  if (found === undefined) return { file: sheet.files[0] ?? '', offset: 0 };
  return { file: found.file, offset: found.offset + Math.min(offset - found.flat.start, found.flat.end - found.flat.start) };
}
