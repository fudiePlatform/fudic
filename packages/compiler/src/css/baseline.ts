/**
 * The CSS detector of Baseline (SDD-83 §3.6, §4.4): what a stylesheet uses of the browser, as compat
 * keys with the place each one is written.
 *
 * It reads the rule tree of `rules.ts` and, in it, each property, its keyword values, its functions
 * and its units, each pseudo-class and pseudo-element, the `&` of nesting and each at-rule. It knows no
 * level: the judge decides what passes.
 *
 * - Custom properties (`--x`) and vendor prefixes (`-webkit-x`) are not looked at.
 * - Inside `@supports`, what its condition names is not reported: `(field-sizing: content)` guards the
 *   property and its value, `selector(:state(open))` the selector. The rest of the block is.
 * - A function with several keys counts as its oldest: better silent than wrong.
 *
 * Used for the `<style>` of a `.fud`, and by the plugin for the guide and the sheets of `styles` —
 * the CSS of fudic does not go through Vite, so what the author writes is what arrives.
 */

import { cssFunctionKeys, cssUnitKey, firstKnown, status } from '@fudic/baseline';
import type { BaselineUse } from '../semantic/baseline.js';
import { span, type Span } from '../types/index.js';
import { parseCssRules, type CssDeclaration, type CssRule } from './rules.js';

/** An identifier of CSS that is neither custom nor vendor-prefixed. */
const IDENT = /^[a-z][a-z0-9-]*$/iu;

/** Every use of the browser in `css`, with spans moved by `offset` (where `css` starts in its file). */
export function cssBaselineUses(css: string, offset = 0): BaselineUse[] {
  const reader = new UseReader(css, offset);
  reader.rules(parseCssRules(css).value.rules, new Set());
  return reader.uses;
}

class UseReader {
  readonly uses: BaselineUse[] = [];

  constructor(
    private readonly css: string,
    private readonly offset: number,
  ) {}

  /** The uses of `rules`, leaving out the keys an enclosing `@supports` guards. */
  rules(rules: readonly CssRule[], guarded: ReadonlySet<string>): void {
    for (const rule of rules) {
      if (rule.type === 'style-rule') {
        this.#keep(selectorUses(this.#text(rule.prelude), rule.prelude.start), guarded);
        for (const declaration of rule.declarations) this.#keep(this.#declaration(declaration), guarded);
        this.rules(rule.children, guarded);
        continue;
      }
      this.#keep(atRuleUse(rule.name, rule.span.start), guarded);
      if (rule.type === 'at-block' && rule.children !== undefined) {
        const inner = rule.name === 'supports' ? new Set([...guarded, ...supportsKeys(this.#text(rule.prelude))]) : guarded;
        this.rules(rule.children, inner);
      }
    }
  }

  #text(at: Span): string {
    return this.css.slice(at.start, at.end);
  }

  #declaration(declaration: CssDeclaration): BaselineUse[] {
    const name = this.css.slice(declaration.span.start, declaration.span.start + declaration.name.length);
    return declarationUses(name, this.#text(declaration.value), declaration.span.start, declaration.value.start);
  }

  /** `found`, moved to the file and without what is guarded. */
  #keep(found: readonly BaselineUse[], guarded: ReadonlySet<string>): void {
    for (const use of found) {
      if (guarded.has(use.key)) continue;
      this.uses.push({ ...use, span: span(use.span.start + this.offset, use.span.end + this.offset) });
    }
  }
}

/** The uses of one declaration: its property, then its keywords, functions and units. */
function declarationUses(written: string, value: string, at: number, valueAt: number): BaselineUse[] {
  const name = written.toLowerCase();
  if (!IDENT.test(name)) return [];
  const uses: BaselineUse[] = [];
  const property = `css.properties.${name}`;
  if (firstKnown([property]) !== undefined) uses.push({ name, key: property, span: span(at, at + name.length) });
  const plain = blankStrings(value);
  for (const match of plain.matchAll(/(?<![\w-])([a-z][a-z0-9-]*)(\()?/giu)) {
    const word = match[1]!.toLowerCase();
    const where = span(valueAt + match.index, valueAt + match.index + word.length);
    const key = match[2] === undefined ? keywordKey(`${property}.${word}`) : oldest(cssFunctionKeys(word));
    if (key === undefined) continue;
    uses.push({ name: match[2] === undefined ? `${name}: ${word}` : `${word}()`, key, span: where });
  }
  for (const match of plain.matchAll(/(?<![\w-])[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?([a-z]+)/giu)) {
    const unit = match[1]!.toLowerCase();
    const key = cssUnitKey(unit);
    if (key === undefined) continue;
    const end = valueAt + match.index + match[0].length;
    uses.push({ name: unit, key, span: span(end - unit.length, end) });
  }
  return uses;
}

/** The uses of a selector list: its pseudo-classes and pseudo-elements, and the `&` of nesting. */
function selectorUses(prelude: string, at: number): BaselineUse[] {
  const uses: BaselineUse[] = [];
  const plain = blankStrings(prelude).replace(/\[[^\]]*\]/gu, (m) => ' '.repeat(m.length));
  for (const match of plain.matchAll(/&|(::?)([a-z][a-z0-9-]*)(\()?/giu)) {
    const where = at + match.index;
    if (match[0] === '&') {
      uses.push({ name: '&', key: 'css.selectors.nesting', span: span(where, where + 1) });
      continue;
    }
    const pseudo = match[2]!.toLowerCase();
    const key = `css.selectors.${pseudo}`;
    if (firstKnown([key]) === undefined) continue;
    const written = `${match[1]}${pseudo}${match[3] === undefined ? '' : '()'}`;
    uses.push({ name: written, key, span: span(where, where + match[1]!.length + pseudo.length) });
  }
  return uses;
}

/** The use of an at-rule by its name, written right after the `@`. */
function atRuleUse(name: string, at: number): BaselineUse[] {
  const key = `css.at-rules.${name}`;
  if (!IDENT.test(name) || firstKnown([key]) === undefined) return [];
  return [{ name: `@${name}`, key, span: span(at, at + 1 + name.length) }];
}

/**
 * The keys a `@supports` condition guards: those of each `(property: value)` it tests and of each
 * `selector(…)`. Every parenthesised group is read, so `not`, `and` and `or` change nothing: an author
 * who tests a feature in any way knows it may be missing.
 */
function supportsKeys(condition: string): ReadonlySet<string> {
  const keys = new Set<string>();
  const plain = blankStrings(condition);
  for (let open = plain.indexOf('('); open !== -1; open = plain.indexOf('(', open + 1)) {
    const inner = plain.slice(open + 1, closing(plain, open));
    const isSelector = /selector\s*$/iu.test(plain.slice(0, open));
    const declaration = /^\s*([-\w]+)\s*:([\s\S]*)$/u.exec(inner);
    const found = isSelector
      ? selectorUses(inner, 0)
      : declaration === null
        ? []
        : declarationUses(declaration[1]!, declaration[2]!, 0, 0);
    for (const use of found) keys.add(use.key);
  }
  return keys;
}

/** The index of the `)` that closes the `(` at `open`, or the end of `text`. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return text.length;
}

/**
 * The key of a keyword value, only when the data gives it a date. A value the data calls missing
 * somewhere is mostly a gap of the data — `cursor: pointer` lacks Safari on iOS, where there is no
 * cursor — and the property already answers for the rest: better silent than wrong.
 */
function keywordKey(key: string): string | undefined {
  const newly = status(key)?.newly;
  return newly === undefined || newly === null ? undefined : key;
}

/** Of a function's keys, the oldest one: a key not in Baseline counts as the newest. */
function oldest(keys: readonly string[]): string | undefined {
  const date = (key: string): string => status(key)?.newly ?? '9999';
  return [...keys].sort((a, b) => date(a).localeCompare(date(b)))[0];
}

/** `text` with the inside of every string blanked, keeping each offset. */
function blankStrings(text: string): string {
  return text.replace(/"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?/gu, (m) => ' '.repeat(m.length));
}
