/**
 * Compiling a `.fud` for one locale (SDD-58 §4.2–§4.8, decisions 158–161): the SOURCE is
 * rewritten — the translated phrase in the order of the translation, `t()` as a literal, a pipe
 * as `$format(…)`, `locale` as `"en"`, a link with its prefix — and the result is compiled as
 * any other `.fud`.
 *
 * Why the source and not the emit. The server emit, the client emit and the hydration all read
 * one tree; a translation applied to that tree's TEXT reaches the three of them by construction,
 * in the same order, and none of them learns that a translation exists. The snippet expansion
 * made the same choice for the same reason (SDD-29 §4.8), and its `OffsetMap` is what keeps the
 * result mapped to the file the author wrote: whatever is copied maps to itself, whatever is
 * written maps to the span of the message it replaces (§5).
 *
 * Nothing here throws, and nothing here reports: a translation that is missing, invalid, or of a
 * shape other than its source's falls back to the original text (§4.10). The catalog's errors are
 * `fudic translate`'s.
 */

import { compileMessage, shapeOf, $href, type CompiledMessage, type MessagePart } from '@fudic/i18n';
import type { RazorExpression } from '../at/index.js';
import { atConstructs } from '../constructs.js';
import { structureDocument, type StructuredDocument } from '../document/index.js';
import { ExpandedText, type OffsetMap } from '../expand/offsets.js';
import type { Attribute, AttributeValuePart, ElementNode } from '../html/index.js';
import { parseDocument } from '../html/index.js';
import type { OxcNode } from '../oxc/index.js';
import { documentRoots, walk } from '../semantic/index.js';
import { span, type Span } from '../types/index.js';
import { child, children, eachNode, i18nImports, unwrap, type I18nName } from './ast.js';
import { batchOf } from './extract.js';
import { contextOf } from './extract.js';
import { collectMessages, type Message, type ViewMessages } from './messages.js';

/** How a module is compiled for one locale. */
export interface LocaleCompile {
  readonly locale: string;
  /** All configured locales, first one the source language: drives href prefixes and alternates. */
  readonly locales: readonly string[];
  /** The text for a message in `locale`, or undefined when it is missing (§4.10). */
  readonly translate: (message: Message) => CompiledMessage | undefined;
  /**
   * How a file is named in a context: its path relative to the project root, POSIX
   * (`src/routes/about.fud`). Injected — the compiler never touches `node:path`. Absent, the
   * path is used as given.
   */
  readonly relative?: (path: string) => string;
}

/** A source rewritten for a locale, and the way back to the original. */
export interface LocalizedSource {
  readonly source: string;
  /** Offsets of `source` → offsets of the original file. */
  readonly map: OffsetMap;
}

/** What the replacement of an edit is made of: text written here, or a span of the original. */
type Piece = { readonly text: string } | { readonly copy: Span };

interface Edit {
  readonly at: Span;
  readonly produce: () => readonly Piece[];
}

/** The runtime pieces a rewrite may call, imported only when called (§4.6). */
type RuntimeName = '$format' | '$message' | '$href';

/** Rewrite a `.fud` for one locale. */
export function localizeSource(source: string, file: string, i18n: LocaleCompile): LocalizedSource {
  const html = parseDocument(source, { atConstructs });
  const document = structureDocument(source, html.value).value;
  const js = batchOf(source, document);
  const imports = i18nImports(js.code);
  const collected = collectMessages({
    source,
    context: contextOf(i18n.relative?.(file) ?? file, document),
    roots: documentRoots(document),
    astAt: js.astAt,
    scripts: js.scripts,
    imports,
    mapSpan: js.mapSpan,
  });
  const rewriter = new Rewriter(source, i18n, js.mapSpan);
  rewriter.messages(collected);
  rewriter.code(js.view, imports, true);
  rewriter.code(js.code, imports, false);
  rewriter.document(document);
  rewriter.importRuntime(document);
  return rewriter.build(file);
}

/** Rewrite a `.ts`/`.js` module of the app for one locale: `t`, `format` and `locale`. */
export function localizeScript(
  source: string,
  program: readonly OxcNode[],
  i18n: LocaleCompile,
  collected: Pick<ViewMessages, 'calls'>,
  file: string,
): LocalizedSource {
  const rewriter = new Rewriter(source, i18n, (a, b) => span(a, b));
  const imports = i18nImports(program);
  rewriter.calls(collected.calls);
  rewriter.code([program], imports, false);
  rewriter.importScript();
  return rewriter.build(file);
}

class Rewriter {
  readonly #edits: Edit[] = [];
  readonly #runtime = new Set<RuntimeName>();
  readonly #locale: string;

  constructor(
    private readonly source: string,
    private readonly i18n: LocaleCompile,
    private readonly mapSpan: (start: number, end: number) => Span,
  ) {
    this.#locale = jsString(i18n.locale);
  }

  #edit(at: Span, produce: () => readonly Piece[]): void {
    this.#edits.push({ at, produce });
  }

  #span(node: OxcNode): Span {
    return this.mapSpan(node.start, node.end);
  }

  /** The message's text in this locale, or `undefined` when the original stays. */
  #translated(message: Message): CompiledMessage | undefined {
    const translation = this.i18n.translate(message);
    if (translation === undefined) return undefined;
    const own = compileMessage(message.source, this.i18n.locale).value;
    // The same message as the source is the source: left byte for byte as written.
    if (JSON.stringify(translation) === JSON.stringify(own)) return undefined;
    // A translation must keep the holes and the tags of its source; one that does not is
    // invalid, and invalid compiles as the original (§4.10).
    return JSON.stringify(shapeOf(translation)) === JSON.stringify(shapeOf(own)) ? translation : undefined;
  }

  // ── Messages of the view ──

  messages(collected: ViewMessages): void {
    const phrases = new Set(collected.phrases.values());
    for (const phrase of phrases) {
      const c = this.#translated(phrase.message);
      if (c === undefined) continue;
      const exprOf = inverse(phrase.holeOf);
      const elementOf = inverse(phrase.tagOf);
      this.#edit(phrase.message.span, () => this.#phrase(c, exprOf, elementOf));
    }
    for (const [attr, { message, holeOf }] of collected.attributes) {
      const c = this.#translated(message);
      if (c === undefined || c.some((p) => typeof p !== 'string' && !('hole' in p))) continue;
      const exprOf = inverse(holeOf);
      const quote = this.#quoteOf(attr);
      this.#edit(message.span, () => {
        const pieces: Piece[] = c.flatMap((p): Piece[] =>
          typeof p === 'string' ? [{ text: attrText(p, quote ?? '"') }] : this.#hole(exprOf.get((p as { hole: string }).hole)),
        );
        return quote === undefined ? [{ text: '"' }, ...pieces, { text: '"' }] : pieces;
      });
    }
    for (const literal of collected.literals.values()) {
      const c = this.#translated(literal.message);
      if (c === undefined || !c.every((p) => typeof p === 'string')) continue;
      const original = this.source.slice(literal.content.start, literal.content.end);
      const lead = /^\s*/u.exec(original)![0];
      const trail = /\s*$/u.exec(original)![0];
      this.#edit(literal.content, () => [{ text: jsEscape(lead + c.join('') + trail) }]);
    }
    this.calls(collected.calls);
  }

  /** `t("…")` → a literal, a template literal, or `$message(…)` (§4.3). Always: `t` throws. */
  calls(calls: ViewMessages['calls']): void {
    for (const { message, call } of calls.values()) {
      const c = this.#translated(message) ?? compileMessage(message.source, this.i18n.locale).value;
      const exprOf = new Map(message.holes.map((h) => [h.name, h.expr]));
      this.#edit(this.#span(call), () => {
        if (c.some(needsRuntime)) return this.#message(c, exprOf);
        if (c.every((p) => typeof p === 'string')) return [{ text: `(${jsString(c.join(''))})` }];
        const pieces: Piece[] = [{ text: '(`' }];
        for (const p of flatten(c)) {
          if (typeof p === 'string') pieces.push({ text: templateEscape(p) });
          else pieces.push({ text: '${(' }, ...this.#copyOf(exprOf.get(p.hole)), { text: ')}' });
        }
        pieces.push({ text: '`)' });
        return pieces;
      });
    }
  }

  #phrase(
    parts: CompiledMessage,
    exprOf: ReadonlyMap<string, RazorExpression>,
    elementOf: ReadonlyMap<number, ElementNode>,
  ): Piece[] {
    const pieces: Piece[] = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        pieces.push({ text: htmlText(part) });
      } else if ('hole' in part) {
        pieces.push(...this.#hole(exprOf.get(part.hole)));
      } else if ('tag' in part) {
        // `#translated` demands the source's shape, so every tag of the translation is one of the run.
        const el = elementOf.get(part.tag)!;
        pieces.push(...this.#render(el.openSpan), ...this.#phrase(part.children ?? [], exprOf, elementOf));
        if (el.closeSpan !== undefined) pieces.push(...this.#render(el.closeSpan));
      } else {
        // A plural or a select: the choice is the value's, so it is made at runtime.
        const spans = new Map([...exprOf].map(([name, expr]) => [name, expr.expr]));
        pieces.push({ text: '@' }, ...this.#message([part], spans));
      }
    }
    return pieces;
  }

  /**
   * A hole: the original expression, explicit so no text written after it can extend it. Always
   * there: `#translated` demands the source's shape, so every hole names an expression of it.
   */
  #hole(expr: RazorExpression | undefined): Piece[] {
    return [{ text: '@(' }, ...this.#render(expr!.expr), { text: ')' }];
  }

  #copyOf(at: Span | undefined): Piece[] {
    return at === undefined ? [{ text: 'undefined' }] : this.#render(at);
  }

  /** `($message(parts, { name: (expr), … }, "en"))`. */
  #message(parts: CompiledMessage, exprOf: ReadonlyMap<string, Span>): Piece[] {
    this.#runtime.add('$message');
    const pieces: Piece[] = [{ text: `($message(${jsValue(parts)},{` }];
    for (const name of shapeOf(parts).holes) {
      pieces.push({ text: `[${jsString(name)}]:(` }, ...this.#copyOf(exprOf.get(name)), { text: '),' });
    }
    pieces.push({ text: `},${this.#locale}))` });
    return pieces;
  }

  #quoteOf(attr: Attribute): string | undefined {
    const first = attr.value[0]!;
    const q = this.source[first.span.start - 1];
    return q === '"' || q === "'" ? q : undefined;
  }

  // ── The JS: pipes, `format()`, `locale` ──

  code(roots: readonly (OxcNode | readonly OxcNode[])[], imports: ReadonlyMap<string, I18nName>, view: boolean): void {
    const named = (node: OxcNode | undefined): I18nName | undefined =>
      node?.type === 'Identifier' ? imports.get(String(node['name'])) : undefined;
    for (const root of roots) {
      eachNode(root, (node) => {
        if (view && node.type === 'BinaryExpression' && node['operator'] === '|') {
          this.#format(child(node, 'right')!, child(node, 'left')!, node);
        } else if (node.type === 'CallExpression' && named(unwrap(child(node, 'callee')!)) === 'format') {
          const [value, pipe] = children(node, 'arguments');
          if (value !== undefined && pipe !== undefined) this.#format(pipe, value, node);
        } else if (node.type === 'Property' && node['shorthand'] === true && named(child(node, 'value')) === 'locale') {
          this.#edit(this.#span(node), () => [{ text: `locale:${this.#locale}` }]);
        } else if (named(node) === 'locale' && !this.#isName(node, roots)) {
          // In parentheses, so `@locale` stays an expression the `@` transition can read.
          this.#edit(this.#span(node), () => [{ text: `(${this.#locale})` }]);
        }
      });
    }
  }

  /** Whether an `Identifier` spells a name rather than reading it: an import, a key, a member. */
  #isName(node: OxcNode, roots: readonly (OxcNode | readonly OxcNode[])[]): boolean {
    let spelled = false;
    for (const root of roots) {
      eachNode(root, (parent) => {
        // An import spells both its names, as two nodes of one span.
        if (parent.type === 'ImportSpecifier' && (child(parent, 'local') === node || child(parent, 'imported') === node)) {
          spelled = true;
        }
        if (parent.type === 'MemberExpression' && parent['computed'] !== true && child(parent, 'property') === node) spelled = true;
        if (parent.type === 'Property' && child(parent, 'key') === node) spelled = true;
        // `{ locale }`: the property is rewritten whole, as `locale: "en"`.
        if (parent.type === 'Property' && parent['shorthand'] === true && child(parent, 'value') === node) spelled = true;
      });
    }
    return spelled;
  }

  #format(pipe: OxcNode, value: OxcNode, whole: OxcNode): void {
    this.#runtime.add('$format');
    this.#edit(this.#span(whole), () => [
      { text: '($format((' },
      ...this.#render(this.#span(pipe)),
      { text: '),(' },
      ...this.#render(this.#span(value)),
      { text: `),${this.#locale}))` },
    ]);
  }

  // ── The document: `<html lang dir>` and links ──

  document(document: StructuredDocument): void {
    if (this.i18n.locales.length < 2) return;
    if (document.type === 'layout-document' || document.type === 'page-document') this.#html(document.html);
    walk(documentRoots(document), { element: (el) => this.#link(el) });
  }

  /** `lang` and `dir` on `<html>`, unless the author wrote them (§4.7). */
  #html(el: ElementNode): void {
    const at = el.openSpan.start + 1 + el.name.length;
    let added = '';
    if (!hasAttr(el, 'lang')) added += ` lang="${this.i18n.locale}"`;
    if (isRtl(this.i18n.locale) && !hasAttr(el, 'dir')) added += ' dir="rtl"';
    if (added !== '') this.#edit(span(at, at), () => [{ text: added }]);
  }

  /** `href`/`action` that start with `/` get the page's prefix (§4.8). */
  #link(el: ElementNode): void {
    const name = el.name.toLowerCase();
    const attrName = name === 'a' || name === 'area' ? 'href' : name === 'form' ? 'action' : undefined;
    if (attrName === undefined) return;
    const attr = el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === attrName);
    if (attr === undefined || attr.value.length === 0) return;
    const parts = attr.value;
    const at = span(parts[0]!.span.start, parts.at(-1)!.span.end);
    const quote = this.#quoteOf(attr);
    if (parts.every((p) => p.type === 'attribute-text')) {
      const href = parts.map((p) => (p as { value: string }).value).join('');
      const prefixed = $href(href, this.i18n.locale, this.i18n.locales);
      if (prefixed !== href) this.#edit(at, () => [{ text: attrText(prefixed, quote ?? '"') }]);
      return;
    }
    this.#runtime.add('$href');
    this.#edit(at, () => [
      { text: '@($href(' },
      ...this.#template(parts),
      { text: `,${this.#locale},${jsValue(this.i18n.locales)}))` },
    ]);
  }

  /** An attribute value as a JS expression: its one `@expr`, or a template literal. */
  #template(parts: readonly AttributeValuePart[]): Piece[] {
    if (parts.length === 1) return [{ text: '(' }, ...this.#render((parts[0] as RazorExpression).expr), { text: ')' }];
    const pieces: Piece[] = [{ text: '`' }];
    for (const p of parts) {
      if (p.type === 'attribute-text') pieces.push({ text: templateEscape(p.value) });
      else pieces.push({ text: '${(' }, ...this.#render(p.expr), { text: ')}' });
    }
    pieces.push({ text: '`' });
    return pieces;
  }

  // ── Imports of the runtime pieces ──

  /** `import { $format } from '@fudic/i18n';` at the head of `@code`, or a `@code` of its own. */
  importRuntime(document: StructuredDocument): void {
    const code = document.code;
    if (code === undefined) {
      const at = this.source.startsWith('﻿') ? 1 : 0;
      this.#edit(span(at, at), () => this.#importStatement((s) => `@code { ${s} }\n`));
      return;
    }
    const first = code.parts[0];
    const at = first === undefined ? code.span.end - 1 : first.span.start;
    this.#edit(span(at, at), () => this.#importStatement((s) => `${s}\n`));
  }

  importScript(): void {
    this.#edit(span(0, 0), () => this.#importStatement((s) => `${s}\n`));
  }

  /** The import of the pieces the rewrite called, or nothing when it called none. */
  #importStatement(wrap: (statement: string) => string): Piece[] {
    if (this.#runtime.size === 0) return [];
    return [{ text: wrap(`import { ${[...this.#runtime].sort().join(', ')} } from '@fudic/i18n';`) }];
  }

  // ── Applying the edits ──

  /** `at` of the original, with every edit inside it applied. */
  #render(at: Span): Piece[] {
    const inside = this.#edits
      .filter((e) => e.at.start >= at.start && e.at.end <= at.end)
      .sort((a, b) => a.at.start - b.at.start || b.at.end - a.at.end);
    const pieces: Piece[] = [];
    let cursor = at.start;
    for (const edit of inside) {
      // An edit inside one already applied is that one's to apply.
      if (edit.at.start < cursor) continue;
      if (edit.at.start > cursor) pieces.push({ copy: span(cursor, edit.at.start) });
      pieces.push(...edit.produce());
      cursor = edit.at.end;
    }
    if (cursor < at.end) pieces.push({ copy: span(cursor, at.end) });
    return pieces;
  }

  build(file: string): LocalizedSource {
    const out = new ExpandedText();
    const whole = span(0, this.source.length);
    // Twice: a producer names the runtime pieces it calls as it runs, and the import at the head
    // of `@code` is produced before the view that calls them. The first pass only listens.
    this.#render(whole);
    let anchor: Span = span(0, 0);
    for (const piece of this.#render(whole)) {
      if ('copy' in piece) {
        out.copy(file, this.source, piece.copy);
        anchor = piece.copy;
      } else {
        out.synthetic(piece.text, { file, at: span(anchor.end, anchor.end) });
      }
    }
    return { source: out.text, map: out.build() };
  }
}

// ── Helpers ──

function inverse<K, V>(map: ReadonlyMap<K, V>): Map<V, K> {
  const out = new Map<V, K>();
  for (const [k, v] of map) if (!out.has(v)) out.set(v, k);
  return out;
}

function hasAttr(el: ElementNode, name: string): boolean {
  return el.attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);
}

/** Whether `locale` is written right to left, asked of `Intl` at build time (§4.7). */
export function isRtl(locale: string): boolean {
  const l = new Intl.Locale(locale) as Intl.Locale & {
    getTextInfo?: () => { direction: string };
    textInfo?: { direction: string };
  };
  return (l.getTextInfo?.() ?? l.textInfo)?.direction === 'rtl';
}

/** Whether a part — or anything inside one of its tags — is a plural or a select. */
function needsRuntime(part: MessagePart): boolean {
  if (typeof part === 'string') return false;
  if ('plural' in part || 'select' in part) return true;
  return 'tag' in part && (part.children ?? []).some(needsRuntime);
}

/** The parts of a message with its tags dissolved into their content: `t()` returns text. */
function flatten(parts: CompiledMessage): readonly (string | { readonly hole: string })[] {
  // Only text and holes are left once the tags dissolve: a message with a plural or a select
  // anywhere goes to `$message` instead (`needsRuntime`), and `#` lives only inside a plural.
  return parts.flatMap((p) =>
    typeof p !== 'string' && 'tag' in p ? flatten(p.children ?? []) : [p as string | { readonly hole: string }],
  );
}


/** Text of the markup: what the HTML parser and the `@` transition would read otherwise. */
function htmlText(text: string): string {
  return text.replace(/[&<>@{}]/gu, (c) => (c === '@' ? '@@' : `&#${c.charCodeAt(0)};`));
}

/** Text of an attribute value inside `quote`. */
function attrText(text: string, quote: string): string {
  return text.replace(/[&@"']/gu, (c) => (c === '@' ? '@@' : c === quote || c === '&' ? `&#${c.charCodeAt(0)};` : c));
}

/** Characters that could end a string, a template, an attribute or a balanced group. */
const JS_SPECIAL = /[\\"'`$@{}<\n\r\u2028\u2029]/gu;

/** Content of a JS string or template literal, whatever its quote. */
function jsEscape(text: string): string {
  return text.replace(JS_SPECIAL, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const templateEscape = jsEscape;

/** A JS string literal that survives inside a quoted attribute: a template with no `${`. */
function jsString(text: string): string {
  return `\`${jsEscape(text)}\``;
}

/** A JS literal of a JSON-like value, every string as `jsString`. */
function jsValue(value: unknown): string {
  if (typeof value === 'string') return jsString(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(jsValue).join(',')}]`;
  // A compiled message holds strings, numbers, arrays and plain objects, and nothing else.
  return `{${Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `[${jsString(k)}]:${jsValue(v)}`)
    .join(',')}}`;
}

