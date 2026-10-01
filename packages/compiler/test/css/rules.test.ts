/**
 * SDD-49 criteria 1–2: the rule tree of a plain stylesheet (`parseCssRules`).
 *
 * Every span is asserted by slicing the text it covers: that is what the prune reads, and a
 * span one character off is a rule cut in half.
 */

import { describe, expect, it } from 'vitest';
import {
  FUD_SHEET_UNREADABLE,
  parseCssRules,
  type BlockAtRule,
  type CssDeclaration,
  type CssRule,
  type StatementAtRule,
  type StyleRule,
} from '../../src/css/rules.js';
import type { Span } from '../../src/types/index.js';

const slice = (css: string, at: Span): string => css.slice(at.start, at.end);

function rulesOf(css: string): readonly CssRule[] {
  const { value, diagnostics } = parseCssRules(css);
  expect(diagnostics).toEqual([]);
  expect(value.type).toBe('css-sheet');
  expect(value.span).toEqual({ start: 0, end: css.length });
  return value.rules;
}

function style(rule: CssRule | undefined): StyleRule {
  expect(rule?.type).toBe('style-rule');
  return rule as StyleRule;
}

function block(rule: CssRule | undefined): BlockAtRule {
  expect(rule?.type).toBe('at-block');
  return rule as BlockAtRule;
}

function statement(rule: CssRule | undefined): StatementAtRule {
  expect(rule?.type).toBe('at-statement');
  return rule as StatementAtRule;
}

/** A declaration as `[name, value text, whole text]`. */
function decl(css: string, d: CssDeclaration): readonly [string, string, string] {
  expect(d.type).toBe('css-declaration');
  return [d.name, slice(css, d.value), slice(css, d.span)];
}

describe('style rules (criterion 1)', () => {
  it('reads a rule with its prelude, its declarations and its exact span', () => {
    const css = '  h1 , h2  {  color : red ;  margin:0 }  ';
    const [rule] = rulesOf(css);
    const r = style(rule);
    expect(slice(css, r.span)).toBe('h1 , h2  {  color : red ;  margin:0 }');
    expect(slice(css, r.prelude)).toBe('h1 , h2');
    expect(r.declarations.map((d) => decl(css, d))).toEqual([
      ['color', 'red', 'color : red'],
      ['margin', '0', 'margin:0'],
    ]);
    expect(r.children).toEqual([]);
  });

  it('lower-cases a property name and keeps a custom property as written', () => {
    const css = '.a { COLOR: Red; --Brand: #ABC; Background-Color: X }';
    const r = style(rulesOf(css)[0]);
    expect(r.declarations.map((d) => decl(css, d)[0])).toEqual(['color', '--Brand', 'background-color']);
    expect(decl(css, r.declarations[0]!)[1]).toBe('Red');
  });

  it('keeps `!important` inside the value', () => {
    const css = '.a { color: red !important; }';
    expect(decl(css, style(rulesOf(css)[0]).declarations[0]!)[1]).toBe('red !important');
  });

  it('reads a declaration without a colon as a name with an empty value', () => {
    const css = '.a { stray ; }';
    const [d] = style(rulesOf(css)[0]).declarations;
    expect(d!.name).toBe('stray');
    expect(d!.value).toEqual({ start: 10, end: 10 });
  });

  it('skips an empty declaration (a stray `;` inside a block)', () => {
    const css = '.a { ; ; color: red;; }';
    expect(style(rulesOf(css)[0]).declarations.map((d) => d.name)).toEqual(['color']);
  });

  it('splits a value at the first top-level colon only', () => {
    const css = '.a { background: url(a:b) ; --x: a:b }';
    const r = style(rulesOf(css)[0]);
    expect(r.declarations.map((d) => decl(css, d).slice(0, 2))).toEqual([
      ['background', 'url(a:b)'],
      ['--x', 'a:b'],
    ]);
  });

  it('reads several rules in order, and an empty one', () => {
    const css = 'a{}b{x:1}';
    const rules = rulesOf(css).map((r) => slice(css, style(r).span));
    expect(rules).toEqual(['a{}', 'b{x:1}']);
  });
});

describe('nesting (criterion 1)', () => {
  it('separates the own declarations from the nested rules', () => {
    const css = '.card { padding: 1rem; & .body { margin: 0 } > li { x: y } color: red }';
    const r = style(rulesOf(css)[0]);
    expect(r.declarations.map((d) => d.name)).toEqual(['padding', 'color']);
    expect(r.children.map((c) => slice(css, style(c).prelude))).toEqual(['& .body', '> li']);
    expect(slice(css, style(r.children[0]).span)).toBe('& .body { margin: 0 }');
  });

  it('reads an `@media` inside a rule as a child', () => {
    const css = '.a { color: red; @media (min-width: 1px) { color: blue; .b { x: y } } }';
    const r = style(rulesOf(css)[0]);
    const media = block(r.children[0]);
    expect(media.name).toBe('media');
    expect(slice(css, media.prelude)).toBe('(min-width: 1px)');
    expect(slice(css, media.span)).toBe('@media (min-width: 1px) { color: blue; .b { x: y } }');
    // A bare declaration in a grouping block is not a rule: skipped, the rule after it read.
    expect(media.children?.map((c) => slice(css, style(c).prelude))).toEqual(['.b']);
  });

  it('reads an at-statement inside a rule, closed by the `}`', () => {
    const css = '.a { @apply x }';
    const s = statement(style(rulesOf(css)[0]).children[0]);
    expect(s.name).toBe('apply');
    expect(slice(css, s.span)).toBe('@apply x ');
    expect(slice(css, s.prelude)).toBe('x');
  });
});

describe('at-rules (criterion 1)', () => {
  it.each(['media', 'supports', 'container', 'layer', 'scope', 'starting-style', 'document', '-moz-document'])(
    '`@%s` holds rules',
    (name) => {
      const css = `@${name} (x) { .a { color: red } p { } }`;
      const r = block(rulesOf(css)[0]);
      expect(r.name).toBe(name);
      expect(slice(css, r.span)).toBe(css);
      expect(slice(css, r.prelude)).toBe('(x)');
      expect(slice(css, r.body)).toBe(' .a { color: red } p { } ');
      expect(r.children?.map((c) => slice(css, style(c).prelude))).toEqual(['.a', 'p']);
    },
  );

  it('lower-cases the name of an at-rule', () => {
    const css = '@MEDIA print { }';
    const r = block(rulesOf(css)[0]);
    expect(r.name).toBe('media');
    expect(r.children).toEqual([]);
  });

  it('nests grouping blocks', () => {
    const css = '@layer base { @media print { a { } } }';
    const outer = block(rulesOf(css)[0]);
    const inner = block(outer.children?.[0]);
    expect(slice(css, inner.span)).toBe('@media print { a { } }');
    expect(inner.children).toHaveLength(1);
  });

  it.each([
    ['@font-face { font-family: X; src: url(x.woff2) }', 'font-face', '', ' font-family: X; src: url(x.woff2) '],
    ['@keyframes spin { from { opacity: 0 } to { opacity: 1 } }', 'keyframes', 'spin', ' from { opacity: 0 } to { opacity: 1 } '],
    ['@page :first { margin: 1in }', 'page', ':first', ' margin: 1in '],
    ['@property --x { syntax: "<length>"; inherits: false }', 'property', '--x', ' syntax: "<length>"; inherits: false '],
    ['@whatever thing { a { b: c } }', 'whatever', 'thing', ' a { b: c } '],
  ])('reads `%s` as one opaque body', (css, name, prelude, body) => {
    const r = block(rulesOf(css)[0]);
    expect(r.name).toBe(name);
    expect(slice(css, r.prelude)).toBe(prelude);
    expect(slice(css, r.body)).toBe(body);
    expect(slice(css, r.span)).toBe(css);
    expect(r.children).toBeUndefined();
  });

  it.each([
    ['@import url("a.css") screen;', 'import', 'url("a.css") screen'],
    ['@layer a, b;', 'layer', 'a, b'],
    ['@charset "utf-8";', 'charset', '"utf-8"'],
    ['@namespace svg url(http://www.w3.org/2000/svg);', 'namespace', 'svg url(http://www.w3.org/2000/svg)'],
  ])('reads `%s` as a statement', (css, name, prelude) => {
    const s = statement(rulesOf(css)[0]);
    expect(s.name).toBe(name);
    expect(slice(css, s.prelude)).toBe(prelude);
    expect(slice(css, s.span)).toBe(css);
  });

  it('reads a statement at the end of the sheet without its `;`', () => {
    const css = 'a { } @import "x.css"  ';
    const s = statement(rulesOf(css)[1]);
    expect(slice(css, s.span)).toBe('@import "x.css"  ');
    expect(slice(css, s.prelude)).toBe('"x.css"');
  });

  it('reads a statement inside a grouping block, closed by the `}`', () => {
    const css = '@media print { @layer a, b }';
    const media = block(rulesOf(css)[0]);
    const s = statement(media.children?.[0]);
    expect(slice(css, s.span)).toBe('@layer a, b ');
    expect(slice(css, media.span)).toBe(css);
  });

  it('reads an `@` with no name', () => {
    const css = '@ ;a{}';
    const rules = rulesOf(css);
    expect(statement(rules[0]).name).toBe('');
    expect(style(rules[1]).prelude).toEqual({ start: 3, end: 4 });
  });
});

describe('what is not a rule (criterion 1)', () => {
  it('skips stray `;`, a stray `}` and a declaration at the root', () => {
    const css = ';; } color: red; a { } stray } b { }';
    expect(rulesOf(css).map((r) => slice(css, style(r).prelude))).toEqual(['a', 'b']);
  });

  it('stops at trailing text that opens nothing', () => {
    const css = 'a { } trailing';
    expect(rulesOf(css)).toHaveLength(1);
  });

  it('skips comments between rules and inside a block', () => {
    const css = '/* { */ a /* { */ { /* } */ color: red; /* x */ } /* } */';
    const r = style(rulesOf(css)[0]);
    expect(slice(css, r.prelude)).toBe('a /* { */');
    expect(r.declarations.map((d) => d.name)).toEqual(['color']);
  });

  it('does not stop at a brace in a string, an escape or parentheses', () => {
    const css = '.a\\{b[title="{;}"] { content: "}" ; x: \'{\' ; y: f(;) ; z: [;] ; w: a\\;b } p { }';
    const rules = rulesOf(css);
    const r = style(rules[0]);
    expect(slice(css, r.prelude)).toBe('.a\\{b[title="{;}"]');
    expect(r.declarations.map((d) => decl(css, d)[1])).toEqual(['"}"', "'{'", 'f(;)', '[;]', 'a\\;b']);
    expect(rules).toHaveLength(2);
  });

  it('reads a string with an escaped quote', () => {
    const css = '.a { content: "a\\"}" }';
    expect(decl(css, style(rulesOf(css)[0]).declarations[0]!)[1]).toBe('"a\\"}"');
  });

  it('treats a `)` with nothing open as an ordinary character', () => {
    const css = '.a { x: ) ; y: z }';
    expect(style(rulesOf(css)[0]).declarations.map((d) => decl(css, d)[1])).toEqual([')', 'z']);
  });

  it('reads an empty sheet', () => {
    expect(rulesOf('')).toEqual([]);
    expect(rulesOf('  /* only */  ')).toEqual([]);
  });
});

describe('text it cannot read: FUD0851, never throws (criterion 2)', () => {
  function unreadable(css: string): { rules: readonly CssRule[]; at: string; message: string } {
    let result!: ReturnType<typeof parseCssRules>;
    expect(() => {
      result = parseCssRules(css);
    }).not.toThrow();
    expect(result.diagnostics).toHaveLength(1);
    const [d] = result.diagnostics;
    expect(d!.code).toBe(FUD_SHEET_UNREADABLE);
    expect(d!.severity).toBe('warning');
    return { rules: result.value.rules, at: slice(css, d!.span), message: d!.message };
  }

  it('a `{` that never closes, on a rule: span on the `{`, the rules before it kept', () => {
    const css = 'a { } b { color: red';
    const r = unreadable(css);
    expect(r.rules.map((x) => slice(css, style(x).prelude))).toEqual(['a']);
    expect(r.at).toBe('{');
    expect(css.indexOf(r.at, 6)).toBe(8);
    expect(r.message).toContain('never closes');
  });

  it('a rule whose block ends right after its declarations', () => {
    expect(unreadable('a { color: red; ').at).toBe('{');
  });

  it('a nested rule that never closes', () => {
    const css = 'a { b { c: d }  e { ';
    const r = unreadable(css);
    expect(r.rules).toEqual([]);
    expect(r.at).toBe('{');
  });

  it('a `{` that never closes, on an `@media`', () => {
    const css = 'a { } @media print { p { } ';
    const r = unreadable(css);
    expect(r.rules).toHaveLength(1);
    expect(r.at).toBe('{');
    expect(css.indexOf('{', 13)).toBe(19);
  });

  it('a rule that never closes inside an `@media`: the inner `{` is where it is lost', () => {
    const css = '@media print { p { color: red';
    const { value, diagnostics } = parseCssRules(css);
    expect(value.rules).toEqual([]);
    expect(diagnostics[0]!.span).toEqual({ start: 17, end: 18 });
  });

  it('a `{` that never closes, on an `@font-face`', () => {
    const css = 'a { } @font-face { font-family: x; ';
    const { value, diagnostics } = parseCssRules(css);
    expect(value.rules).toHaveLength(1);
    expect(diagnostics.map((d) => [d.code, d.span])).toEqual([[FUD_SHEET_UNREADABLE, { start: 17, end: 18 }]]);
  });

  it('a nested `{` inside an opaque body that never closes', () => {
    const css = '@keyframes k { from { opacity: 0 }';
    expect(unreadable(css).at).toBe('{');
    expect(parseCssRules(css).diagnostics[0]!.span.start).toBe(13);
  });

  it('a string that never ends: the first loss is the one reported', () => {
    const css = 'a { } b { content: "open }';
    const r = unreadable(css);
    expect(r.rules).toHaveLength(1);
    expect(r.at).toBe('"open }');
    expect(r.message).toContain('string');
  });

  it('a string that never ends in an at-rule prelude', () => {
    const css = 'a { } @import "x.css';
    const r = unreadable(css);
    expect(r.rules).toHaveLength(1);
    expect(r.at).toBe('"x.css');
  });

  it('a string that never ends inside an opaque body', () => {
    const r = unreadable('@font-face { src: "x }');
    expect(r.rules).toEqual([]);
    expect(r.at).toBe('"x }');
  });

  it('a comment that never ends, between rules and inside a block', () => {
    const between = 'a { } /* open';
    const r = unreadable(between);
    expect(r.rules).toHaveLength(1);
    expect(r.at).toBe('/* open');
    expect(r.message).toContain('comment');

    expect(unreadable('a { color: red /* open }').at).toBe('/* open }');
  });

  it('a lost `@media` inside a rule drops the rule', () => {
    const css = 'a { @media print { ';
    expect(unreadable(css).rules).toEqual([]);
  });

  it('a rule after a lost `@media` is not read', () => {
    const css = '@media print { "open } a { }';
    const r = unreadable(css);
    expect(r.rules).toEqual([]);
    expect(r.at).toBe('"open } a { }');
  });
});
