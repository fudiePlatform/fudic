/**
 * A style guide, read: the whole sheet a page links, and the pieces a component may adopt.
 *
 * A guide is a sheet of `@import`s — tokens, the document's reset, then one file per element.
 * The page gets it whole, flattened and pruned like any sheet it links. A component cannot
 * take it whole (an adopted sheet has no `:root`, no `@font-face`, no `@import`), so the files
 * the guide imports are offered one by one, under their file name: those are the pieces.
 *
 * Which import is a piece is decided by what the file holds, never by a mark: a file whose
 * every rule is the document's (`:root`, `html`, `body`, `@font-face`, `@property`) has nothing
 * a shadow root could use. Which piece styles which element is decided by its selectors, read
 * narrowly — only a type selector in the subject counts — because the editor adds a piece on
 * that answer alone, and an answer it adds on has to be right every time.
 *
 * Files are read through the host (`textOf`), as everywhere in the compiler.
 */

import { STYLE_NAME_PATTERN } from '@fudic/config';
import { FUD1442 } from '@fudic/diagnostics';
import type { Diagnostic } from '../types/index.js';
import { withDiagnostics, type ParseResult } from '../types/index.js';
import { flattenImports, isRelative, joinSpec, parseImport, type FlatSheet } from './flatten.js';
import { parseCssRules, type CssRule } from './rules.js';
import { parseSelectorList, type ComplexSelector, type CompoundSelector } from './selectors.js';

export interface GuidePiece {
  /** The file's basename without `.css`: what `shadowrootadoptedstylesheets` names. */
  readonly name: string;
  /** The piece's file, as the host spells paths. */
  readonly path: string;
  readonly css: string;
}

export interface Guide {
  /** The whole guide, imports flattened: what every page links. */
  readonly sheet: FlatSheet;
  /** The adoptable imports, in import order. */
  readonly pieces: readonly GuidePiece[];
}

/** Selectors and at-rules that only mean something in the document, never in a shadow root. */
const DOCUMENT_TYPES = new Set(['html', 'body']);
const DOCUMENT_AT_RULES = new Set(['font-face', 'property']);

/**
 * Read the guide at `sheetPath`. Every path — `sheetPath`, what `textOf` is asked for, each
 * piece's `path` and the entries of `globals` — is in the host's spelling, relative to one
 * base the host chose. A guide that cannot be read is an empty guide: saying so is the host's,
 * which knows the `fudic.json` that named it.
 */
export function readGuide(
  sheetPath: string,
  textOf: (path: string) => string | undefined,
  /** Files the same project declares in `globalStyles`: never pieces. */
  globals: ReadonlySet<string>,
): ParseResult<Guide> {
  const read = (spec: string): string | null => textOf(spec) ?? null;
  const css = textOf(sheetPath) ?? '';
  const sheet = flattenImports(sheetPath, css, read);
  const diagnostics: Diagnostic[] = [];
  const pieces: GuidePiece[] = [];
  const root = joinSpec('./x', sheetPath);
  for (const rule of parseCssRules(css).value.rules) {
    if (rule.type !== 'at-statement' || rule.name !== 'import') continue;
    const imp = parseImport(css.slice(rule.prelude.start, rule.prelude.end));
    if (imp === null || !isRelative(imp.url)) continue;
    const path = joinSpec(root, imp.url);
    const text = textOf(path);
    if (text === undefined || globals.has(path) || !adoptable(text)) continue;
    const name = basename(path);
    if (!STYLE_NAME_PATTERN.test(name)) {
      diagnostics.push(FUD1442({ span: rule.span, name, pattern: STYLE_NAME_PATTERN.source }));
      continue;
    }
    pieces.push({ name, path, css: text });
  }
  return withDiagnostics({ sheet, pieces }, diagnostics);
}

/** The file name of a specifier, without its `?query` or `#fragment` and without `.css`. */
function basename(spec: string): string {
  const cut = spec.search(/[?#]/u);
  const path = cut === -1 ? spec : spec.slice(0, cut);
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.css$/iu, '');
}

/** Whether a file holds at least one rule a shadow root can use. */
function adoptable(css: string): boolean {
  const rules = (list: readonly CssRule[]): boolean =>
    list.some((rule) => {
      if (rule.type === 'style-rule') {
        return !documentOnly(css.slice(rule.prelude.start, rule.prelude.end));
      }
      if (rule.type === 'at-block' && rule.children !== undefined) return rules(rule.children);
      return !DOCUMENT_AT_RULES.has(rule.name);
    });
  return rules(parseCssRules(css).value.rules);
}

/** Every selector of the list names the document (`:root`, `html`, `body`) somewhere. */
function documentOnly(prelude: string): boolean {
  const list = parseSelectorList(prelude);
  // A list it cannot read may match anything: it is not the document's only.
  return list !== null && list.every((selector) => selector.compounds.some(namesDocument));
}

function namesDocument(compound: CompoundSelector): boolean {
  return (
    (compound.type !== undefined && DOCUMENT_TYPES.has(compound.type)) ||
    compound.pseudo.includes('root') ||
    compound.anyOf.some((list) => list.every((s) => s.compounds.some(namesDocument)))
  );
}

/** The tags each piece styles, read once per piece. */
const tagsOf = new WeakMap<GuidePiece, ReadonlySet<string>>();

/** The tags a piece styles: the type selectors of the subjects of its rules. */
export function piecesForTag(pieces: readonly GuidePiece[], tag: string): readonly string[] {
  const wanted = tag.toLowerCase();
  return pieces.filter((piece) => styledTags(piece).has(wanted)).map((piece) => piece.name);
}

function styledTags(piece: GuidePiece): ReadonlySet<string> {
  const cached = tagsOf.get(piece);
  if (cached !== undefined) return cached;
  const tags = new Set<string>();
  const visit = (list: readonly CssRule[]): void => {
    for (const rule of list) {
      if (rule.type === 'style-rule') {
        for (const selector of parseSelectorList(piece.css.slice(rule.prelude.start, rule.prelude.end)) ?? []) {
          subjectTypes(selector, tags);
        }
      } else if (rule.type === 'at-block' && rule.children !== undefined) {
        visit(rule.children);
      }
    }
  };
  visit(parseCssRules(piece.css).value.rules);
  tagsOf.set(piece, tags);
  return tags;
}

/** The type selectors of a selector's subject, `:is()`/`:where()` looked into. */
function subjectTypes(selector: ComplexSelector, into: Set<string>): void {
  // A parsed selector has at least one compound: the parser refuses an empty one.
  const subject = selector.compounds[selector.compounds.length - 1]!;
  if (subject.type !== undefined) into.add(subject.type);
  for (const list of subject.anyOf) {
    for (const inner of list) subjectTypes(inner, into);
  }
}
