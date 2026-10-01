/**
 * The rule tree of a PLAIN stylesheet (SDD-49 §3.1).
 *
 * `parseStyle` (SDD-09) reads a `<style>` body as flat runs and never builds rules: the
 * browser parses the real CSS, and the compiler only interpolates Razor. Pruning a sheet
 * needs the rules, so this module reads them — for a `.css` file and nothing else, which is
 * what makes it safe to ignore Razor: a `.css` has none, and an `@` is always CSS's.
 *
 * It is a reader, not a validator. It finds where each rule starts and ends, what its
 * prelude is and what its block holds, and leaves every byte in between to the browser.
 * Anything it does not recognise is simply not a rule — the prune keeps text it did not
 * understand, so a gap here costs bytes, never a style.
 *
 * Three things stop it, and they are the three a browser cannot recover from either: a `{`
 * that never closes, a string that never ends and a comment that never ends. It never
 * throws: it reports `FUD0851` where it lost its way and returns what it read up to there.
 */

import type { Diagnostic, Node, ParseResult, Span } from '../types/index.js';
import { ok, span, withDiagnostics } from '../types/index.js';
import { FUD0851, type FUD0851Params } from '@fudic/diagnostics';

export interface CssRuleTree extends Node {
  readonly type: 'css-sheet';
  readonly rules: readonly CssRule[];
}

export type CssRule = StyleRule | BlockAtRule | StatementAtRule;

/** `name: value`, without the `;`. */
export interface CssDeclaration extends Node {
  readonly type: 'css-declaration';
  /** Lower case; a custom property's (`--x`) as written, because it is case-sensitive. */
  readonly name: string;
  /** What follows the `:`, trimmed; empty when there is no `:`. */
  readonly value: Span;
}

/** `selector { declarations; nested rules }` */
export interface StyleRule extends Node {
  readonly type: 'style-rule';
  readonly prelude: Span;
  /** Its own declarations, without the nested rules. */
  readonly declarations: readonly CssDeclaration[];
  /** CSS nesting: the rules written inside the block. */
  readonly children: readonly CssRule[];
}

/** `@media …{ }`, `@supports`, `@container`, `@layer x { }`, `@scope`, `@keyframes`, `@font-face`… */
export interface BlockAtRule extends Node {
  readonly type: 'at-block';
  /** Without the `@`, lower case. */
  readonly name: string;
  readonly prelude: Span;
  readonly body: Span;
  /** Present when the body holds rules (`@media`); absent when it holds declarations (`@font-face`). */
  readonly children?: readonly CssRule[];
}

/** `@import …;`, `@layer a, b;`, `@charset`, `@namespace` */
export interface StatementAtRule extends Node {
  readonly type: 'at-statement';
  readonly name: string;
  readonly prelude: Span;
}

/**
 * The at-rules whose block holds RULES. Every other block — `@font-face`, `@keyframes`,
 * `@page`, `@property`, an at-rule nobody has heard of — is read as one opaque body: its
 * content is not a list of selectors, and the prune keeps or drops it whole.
 */
const GROUPING = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'scope',
  'starting-style',
  'document',
  '-moz-document',
]);

const SPACE = /\s/u;
const NAME = /[\w-]/u;

/** A block's content: what the scanner read, and the index of its `}` (or the end). */
interface Listing {
  readonly rules: readonly CssRule[];
  readonly end: number;
}

class RuleScanner {
  readonly #css: string;
  #error: Diagnostic | null = null;

  constructor(css: string) {
    this.#css = css;
  }

  get error(): Diagnostic | null {
    return this.#error;
  }

  #fail(kind: FUD0851Params['kind'], at: Span): number {
    this.#error ??= FUD0851({ span: at, kind });
    return this.#css.length;
  }

  /** Past a comment that starts at `i`. */
  #comment(i: number): number {
    const close = this.#css.indexOf('*/', i + 2);
    if (close === -1) {
      return this.#fail('comment', span(i, this.#css.length));
    }
    return close + 2;
  }

  /** Past the string that starts at `i`. */
  #string(i: number): number {
    const css = this.#css;
    const quote = css[i];
    let j = i + 1;
    while (j < css.length) {
      const ch = css[j];
      if (ch === '\\') j += 2;
      else if (ch === quote) return j + 1;
      else j += 1;
    }
    return this.#fail('string', span(i, css.length));
  }

  /** Past whitespace and comments. */
  #trivia(i: number): number {
    const css = this.#css;
    while (i < css.length) {
      if (SPACE.test(css[i]!)) i += 1;
      else if (css.startsWith('/*', i)) i = this.#comment(i);
      else break;
    }
    return i;
  }

  /**
   * The first index at or after `i` holding one of `stops`, outside strings, comments,
   * parentheses and brackets — or the end of the text.
   */
  #find(i: number, stops: string): number {
    const css = this.#css;
    let depth = 0;
    while (i < css.length) {
      const ch = css[i]!;
      if (ch === '\\') {
        i += 2;
      } else if (ch === '"' || ch === "'") {
        i = this.#string(i);
      } else if (ch === '/' && css[i + 1] === '*') {
        i = this.#comment(i);
      } else if (ch === '(' || ch === '[') {
        depth += 1;
        i += 1;
      } else if ((ch === ')' || ch === ']') && depth > 0) {
        depth -= 1;
        i += 1;
      } else if (depth === 0 && stops.includes(ch)) {
        return i;
      } else {
        i += 1;
      }
    }
    return css.length;
  }

  /** The `{` at `open` never closed. */
  #unclosed(open: number): number {
    return this.#fail('brace', span(open, open + 1));
  }

  /** The index just past the `}` that closes the `{` at `open`. */
  #close(open: number): number {
    let i = open + 1;
    for (;;) {
      i = this.#find(i, '{}');
      if (i >= this.#css.length) return this.#unclosed(open);
      if (this.#css[i] === '}') return i + 1;
      i = this.#close(i);
    }
  }

  /** `[start, end)` without the whitespace at either side. */
  #trim(start: number, end: number): Span {
    const css = this.#css;
    while (start < end && SPACE.test(css[start]!)) start += 1;
    while (end > start && SPACE.test(css[end - 1]!)) end -= 1;
    return span(start, end);
  }

  /** The declaration in `[start, end)`: its name before the first top-level `:`, its value after. */
  #declaration(start: number, end: number): CssDeclaration {
    const whole = this.#trim(start, end);
    const colon = this.#find(whole.start, ':');
    if (colon >= whole.end) {
      return {
        type: 'css-declaration',
        span: whole,
        name: this.#css.slice(whole.start, whole.end).toLowerCase(),
        value: span(whole.end, whole.end),
      };
    }
    const raw = this.#css.slice(whole.start, colon).trim();
    return {
      type: 'css-declaration',
      span: whole,
      name: raw.startsWith('--') ? raw : raw.toLowerCase(),
      value: this.#trim(colon + 1, whole.end),
    };
  }

  /**
   * The rules of a list: the sheet (`inBlock` false) or a grouping block. It returns at the
   * `}` that closes the block, or at the end of the text.
   *
   * Text that is not a rule — a stray `;`, a declaration where none belongs — is skipped,
   * not reported: the browser drops it too, and the prune leaves it where it was.
   */
  rules(i: number, inBlock: boolean): Listing {
    const css = this.#css;
    const rules: CssRule[] = [];
    for (;;) {
      i = this.#trivia(i);
      if (i >= css.length) return { rules, end: css.length };
      const ch = css[i];
      if (ch === '}') {
        if (inBlock) return { rules, end: i };
        i += 1;
      } else if (ch === ';') {
        i += 1;
      } else if (ch === '@') {
        const at = this.#atRule(i);
        if (at.rule !== null) rules.push(at.rule);
        i = at.end;
      } else {
        const stop = this.#find(i, '{;}');
        if (stop >= css.length) return { rules, end: css.length };
        if (css[stop] === '{') {
          const rule = this.#styleRule(i, stop);
          if (rule === null) return { rules, end: css.length };
          rules.push(rule);
          i = rule.span.end;
        } else {
          i = css[stop] === ';' ? stop + 1 : stop;
        }
      }
    }
  }

  /** `prelude { … }` with its `{` at `open`, or `null` when it never closes. */
  #styleRule(start: number, open: number): StyleRule | null {
    const css = this.#css;
    const declarations: CssDeclaration[] = [];
    const children: CssRule[] = [];
    let i = open + 1;
    for (;;) {
      i = this.#trivia(i);
      if (i >= css.length) {
        this.#unclosed(open);
        return null;
      }
      const ch = css[i];
      if (ch === '}') break;
      if (ch === ';') {
        i += 1;
      } else if (ch === '@') {
        const at = this.#atRule(i);
        if (at.rule !== null) children.push(at.rule);
        i = at.end;
      } else {
        const stop = this.#find(i, '{;}');
        if (stop >= css.length) {
          this.#unclosed(open);
          return null;
        }
        if (css[stop] === '{') {
          const rule = this.#styleRule(i, stop);
          if (rule === null) return null;
          children.push(rule);
          i = rule.span.end;
        } else {
          declarations.push(this.#declaration(i, stop));
          i = css[stop] === ';' ? stop + 1 : stop;
        }
      }
    }
    return {
      type: 'style-rule',
      span: span(start, i + 1),
      prelude: this.#trim(start, open),
      declarations,
      children,
    };
  }

  /** An at-rule starting at its `@`, and where the scan resumes. */
  #atRule(start: number): { readonly rule: CssRule | null; readonly end: number } {
    const css = this.#css;
    let nameEnd = start + 1;
    while (nameEnd < css.length && NAME.test(css[nameEnd]!)) nameEnd += 1;
    const name = css.slice(start + 1, nameEnd).toLowerCase();
    const stop = this.#find(nameEnd, '{;}');
    if (this.#error !== null) return { rule: null, end: css.length };
    if (stop >= css.length || css[stop] !== '{') {
      // A statement: up to its `;`, or to the `}` of the block it sits in, or to the end.
      const end = stop < css.length && css[stop] === ';' ? stop + 1 : stop;
      const rule: StatementAtRule = {
        type: 'at-statement',
        span: span(start, end),
        name,
        prelude: this.#trim(nameEnd, stop),
      };
      return { rule, end };
    }
    const prelude = this.#trim(nameEnd, stop);
    if (GROUPING.has(name)) {
      const inner = this.rules(stop + 1, true);
      if (inner.end >= css.length) {
        this.#unclosed(stop);
        return { rule: null, end: css.length };
      }
      const rule: BlockAtRule = {
        type: 'at-block',
        span: span(start, inner.end + 1),
        name,
        prelude,
        body: span(stop + 1, inner.end),
        children: inner.rules,
      };
      return { rule, end: inner.end + 1 };
    }
    const close = this.#close(stop);
    if (this.#error !== null) return { rule: null, end: css.length };
    const rule: BlockAtRule = {
      type: 'at-block',
      span: span(start, close),
      name,
      prelude,
      body: span(stop + 1, close - 1),
    };
    return { rule, end: close };
  }
}

/**
 * The rules of a plain stylesheet. Every node carries its span over `css`; on text it
 * cannot read it reports `FUD0851` where it lost its way and returns the rules it had
 * finished by then.
 */
export function parseCssRules(css: string): ParseResult<CssRuleTree> {
  const scanner = new RuleScanner(css);
  const { rules } = scanner.rules(0, false);
  const tree: CssRuleTree = { type: 'css-sheet', span: span(0, css.length), rules };
  return scanner.error === null ? ok(tree) : withDiagnostics(tree, [scanner.error]);
}
