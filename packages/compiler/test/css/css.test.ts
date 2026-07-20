/**
 * SDD-09 acceptance criteria (§6) for CSS with Razor inside `<style>`.
 */

import { describe, expect, it } from 'vitest';
import {
  CSS_AT_RULES,
  atRuleNameEnd,
  isCssAtRule,
  parseStyle,
  type CssPart,
  type StyleNode,
} from '../../src/css/index.js';
import { span, type Diagnostic } from '../../src/types/index.js';

/** Parse a whole source string as if it were a `<style>` body. */
function parse(source: string): { node: StyleNode; diagnostics: readonly Diagnostic[] } {
  const { value, diagnostics } = parseStyle(source, span(0, source.length));
  return { node: value, diagnostics };
}

/** The parts as `[type, sourceText]` pairs — the shape the criteria talk about. */
function shape(source: string): readonly (readonly [string, string])[] {
  return parse(source).node.parts.map(
    (p) => [p.type, source.slice(p.span.start, p.span.end)] as const,
  );
}

function codes(source: string): readonly string[] {
  return parse(source).diagnostics.map((d) => d.code);
}

/** The JS text of a razor-expression part. */
function exprText(source: string, part: CssPart): string {
  if (part.type !== 'razor-expression') throw new Error(`not an expression: ${part.type}`);
  return source.slice(part.expr.start, part.expr.end);
}

/** §5: parts tile the body with no gaps and no overlaps. */
function assertTiles(source: string, node: StyleNode): void {
  let cursor = node.span.start;
  for (const part of node.parts) {
    expect(part.span.start).toBe(cursor);
    expect(part.span.end).toBeGreaterThanOrEqual(part.span.start);
    cursor = part.span.end;
  }
  expect(cursor).toBe(node.span.end);
}

describe('the at-rule whitelist (§3, decision 42.a/b)', () => {
  it('holds the 17 closed at-rules', () => {
    expect(CSS_AT_RULES.size).toBe(17);
    for (const name of ['charset', 'media', 'font-face', 'starting-style', 'document']) {
      expect(CSS_AT_RULES.has(name)).toBe(true);
    }
  });

  it('matches ASCII case-insensitively and rejects non-members', () => {
    expect(isCssAtRule('media')).toBe(true);
    expect(isCssAtRule('MEDIA')).toBe(true);
    expect(isCssAtRule('Font-Face')).toBe(true);
    expect(isCssAtRule('bp')).toBe(false);
    expect(isCssAtRule('')).toBe(false);
  });

  it('reads the at-rule identifier grammar [a-zA-Z][a-zA-Z0-9-]*', () => {
    expect(atRuleNameEnd('font-face ', 0)).toBe(9);
    expect(atRuleNameEnd('layer2;', 0)).toBe(6);
    // Runs to the end of the source without a terminator.
    expect(atRuleNameEnd('media', 0)).toBe(5);
    // No identifier: a digit, a hyphen or a symbol may not open one.
    expect(atRuleNameEnd('9lives', 0)).toBe(0);
    expect(atRuleNameEnd('-webkit-x', 0)).toBe(0);
    expect(atRuleNameEnd('', 0)).toBe(0);
    // Every side of the ASCII-letter test: uppercase in, and the two
    // neighbourhoods that surround the ranges ('_' between 'Z' and 'a', '{'
    // above 'z').
    expect(atRuleNameEnd('Media', 0)).toBe(5);
    expect(atRuleNameEnd('_x', 0)).toBe(0);
    expect(atRuleNameEnd('{', 0)).toBe(0);
  });

  it('absorbs an uppercase at-rule as literal CSS', () => {
    expect(shape('@MEDIA print { }')).toEqual([['css-text', '@MEDIA print { }']]);
  });
});

describe('§6.2 static CSS (fixture app-card)', () => {
  const source = ':host { display: block; } .card { border: 1px solid #ddd; }';

  it('yields a single verbatim CssText and balanced braces', () => {
    const { node, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    expect(node.type).toBe('style-content');
    expect(node.parts).toHaveLength(1);
    const [only] = node.parts;
    expect(only?.type).toBe('css-text');
    expect(only?.type === 'css-text' ? only.value : '').toBe(source);
    assertTiles(source, node);
  });

  it('accepts native CSS nesting', () => {
    const nested = '.card { padding: 1rem; .body { margin-top: 0.5rem; } }';
    expect(codes(nested)).toEqual([]);
    expect(shape(nested)).toEqual([['css-text', nested]]);
  });
});

describe('§6.3 at-rule prelude and body interpolation (42.a, 42.d)', () => {
  const source = '@media (min-width: @bp.tablet) { .card { gap: @gap; } }';

  it('splits into literal runs and Razor atoms in source order', () => {
    expect(shape(source)).toEqual([
      ['css-text', '@media (min-width: '],
      ['razor-expression', '@bp.tablet'],
      ['css-text', ') { .card { gap: '],
      ['razor-expression', '@gap'],
      ['css-text', '; } }'],
    ]);
  });

  it('keeps the atoms implicit and tiles the body', () => {
    const { node, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    assertTiles(source, node);
    const atoms = node.parts.filter((p) => p.type === 'razor-expression');
    expect(atoms.map((a) => exprText(source, a))).toEqual(['bp.tablet', 'gap']);
    expect(atoms.every((a) => a.type === 'razor-expression' && a.kind === 'implicit')).toBe(true);
  });
});

describe('§6.4 whitelist decides literal vs Razor (42.b)', () => {
  it('absorbs a whitelisted at-rule as literal CSS', () => {
    const source = '@keyframes spin { to { transform: rotate(360deg); } }';
    expect(shape(source)).toEqual([['css-text', source]]);
    expect(codes(source)).toEqual([]);
  });

  it('treats a non-whitelisted identifier as a Razor expression', () => {
    expect(shape('color: @bp;')).toEqual([
      ['css-text', 'color: '],
      ['razor-expression', '@bp'],
      ['css-text', ';'],
    ]);
  });

  it('reads hyphenated at-rule names in full', () => {
    expect(shape('@font-face { src: local(x); }')).toEqual([
      ['css-text', '@font-face { src: local(x); }'],
    ]);
    // `@font-palette-values` is whitelisted; `@font-weird` is not, and only the
    // JS identifier `font` is taken as the expression — the hyphen ends it.
    expect(shape('@font-weird {}')).toEqual([
      ['razor-expression', '@font'],
      ['css-text', '-weird {}'],
    ]);
  });

  it('leaves a vendor-prefixed at-rule as plain literal text', () => {
    const source = '@-webkit-keyframes spin { }';
    expect(shape(source)).toEqual([['css-text', source]]);
    expect(codes(source)).toEqual([]);
  });

  it('leaves `@` followed by whitespace, a symbol or nothing as literal text', () => {
    expect(shape('a { x: @ y; }')).toEqual([['css-text', 'a { x: @ y; }']]);
    expect(shape('a { x: @+; }')).toEqual([['css-text', 'a { x: @+; }']]);
    expect(shape('@')).toEqual([['css-text', '@']]);
  });
});

describe('§6.5 the `@@` escape (42.c)', () => {
  it('produces an AtEscapeNode inside a CSS string', () => {
    const source = 'a::before { content: "@@"; }';
    expect(shape(source)).toEqual([
      ['css-text', 'a::before { content: "'],
      ['at-escape', '@@'],
      ['css-text', '"; }'],
    ]);
    assertTiles(source, parse(source).node);
  });

  it('produces an AtEscapeNode in ordinary CSS text', () => {
    expect(shape('content: "\\00a0"; @@')).toEqual([
      ['css-text', 'content: "\\00a0"; '],
      ['at-escape', '@@'],
    ]);
  });

  it('does NOT escape inside a CSS comment: §4.1 wins over the criterion example', () => {
    const source = 'content: "x"; /* @@ */';
    expect(shape(source)).toEqual([['css-text', source]]);
  });
});

describe('§6.6 the explicit form `@( ... )`', () => {
  it('embeds an explicit expression', () => {
    const source = 'width: @(base * 2);';
    const { node, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    expect(shape(source)).toEqual([
      ['css-text', 'width: '],
      ['razor-expression', '@(base * 2)'],
      ['css-text', ';'],
    ]);
    const atom = node.parts[1];
    expect(atom !== undefined && exprText(source, atom)).toBe('base * 2');
    expect(atom?.type === 'razor-expression' ? atom.kind : '').toBe('explicit');
  });

  it('reports FUD0002 on an unterminated group and still tiles the body', () => {
    const source = 'width: @(base * 2;';
    const { node, diagnostics } = parse(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0002']);
    assertTiles(source, node);
    expect(node.parts.at(-1)?.type).toBe('razor-expression');
  });

  it('surfaces the balancer regions of the group', () => {
    const source = "content: @('a}b');";
    const atom = parse(source).node.parts[1];
    expect(atom?.type === 'razor-expression' ? atom.regions.map((r) => r.kind) : []).toEqual([
      'string',
    ]);
    // The `}` lives inside the JS string, so it never reaches the brace counter.
    expect(codes(source)).toEqual([]);
  });

  it('never lets an unterminated group escape past the end of the body', () => {
    const source = '<style>a { b: @(c }</style><p>after</p>';
    const body = span(7, 19);
    const { value, diagnostics } = parseStyle(source, body);
    // The `}` is swallowed by the unterminated group, so the block stays open:
    // both the group and the brace balance report, and neither reaches past 19.
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0002', 'FUD0131']);
    expect(diagnostics.every((d) => d.span.end <= 19)).toBe(true);
    expect(value.span).toEqual(body);
    assertTiles(source, value);
    expect(value.parts.at(-1)?.span.end).toBe(19);
  });
});

describe('§6.7 comments are inert, strings interpolate (§4.1, §8)', () => {
  it('keeps a CSS comment literal, `@` included', () => {
    const source = '/* @media no cuenta */ .a { color: red; }';
    expect(shape(source)).toEqual([['css-text', source]]);
    expect(codes(source)).toEqual([]);
  });

  it('does not count braces or read `@` inside a comment', () => {
    const source = '/* { @if } */';
    expect(shape(source)).toEqual([['css-text', source]]);
    expect(codes(source)).toEqual([]);
  });

  it('interpolates inside a CSS string (option A)', () => {
    const source = 'content: "hola @name";';
    expect(shape(source)).toEqual([
      ['css-text', 'content: "hola '],
      ['razor-expression', '@name'],
      ['css-text', '";'],
    ]);
  });

  it('ignores braces inside a string and honours the backslash escape', () => {
    const source = 'a::after { content: "}{ \\" @x"; }';
    expect(codes(source)).toEqual([]);
    expect(shape(source)).toEqual([
      ['css-text', 'a::after { content: "}{ \\" '],
      ['razor-expression', '@x'],
      ['css-text', '"; }'],
    ]);
  });

  it('ends an unterminated string at the line break, not at the end of the body', () => {
    const source = 'a { content: "oops\n}\n';
    // The string closes at the newline, so the `}` still balances the block.
    expect(codes(source)).toEqual([]);
  });

  it('tolerates a string and a comment that run to the end of the body', () => {
    expect(codes('content: "tail')).toEqual([]);
    expect(codes('/* tail')).toEqual([]);
    expect(shape('/* tail')).toEqual([['css-text', '/* tail']]);
  });

  it('treats a lone `/` as an ordinary character', () => {
    const source = 'a { width: 1/2; }';
    expect(shape(source)).toEqual([['css-text', source]]);
  });
});

describe('§6.8 brace balance (42.e)', () => {
  it('reports FUD0131 for an unclosed block', () => {
    const { diagnostics } = parse('.card { color: red');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('FUD0131');
    expect(diagnostics[0]?.span).toEqual(span(18, 18));
  });

  it('reports FUD0131 for an unmatched `}` at its own offset', () => {
    const source = '.a { } }';
    const { diagnostics } = parse(source);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('FUD0131');
    expect(diagnostics[0]?.span).toEqual(span(7, 7));
  });

  it('counts the depth of several unclosed blocks', () => {
    const { diagnostics } = parse('@media x { .a { color: red;');
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0131']);
    expect(diagnostics[0]?.message).toContain('2 block(s)');
  });
});

describe('§6.9 Razor control flow is out of v1 (§4.4)', () => {
  it('rejects `@if` with FUD0130 and degrades to literal text', () => {
    const source = '@if (x) { color: red; }';
    const { node, diagnostics } = parse(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0130']);
    expect(diagnostics[0]?.span).toEqual(span(0, 3));
    // Degraded: the whole body stays literal, and its braces still balance.
    expect(node.parts.map((p) => p.type)).toEqual(['css-text']);
    assertTiles(source, node);
  });

  it('rejects every control keyword, `@code` and `@raw`', () => {
    for (const keyword of ['if', 'else', 'for', 'foreach', 'while', 'switch', 'code']) {
      const source = `@${keyword} (x) { }`;
      expect(codes(source)).toEqual(['FUD0130']);
    }
    // `@raw(...)` is a directive, not a control keyword: same verdict (§4.5).
    const raw = '@raw(x)';
    expect(codes(raw)).toEqual(['FUD0130']);
    // Its own parenthesis scan is discarded: no FUD0002 leaks out of a rejected
    // construct.
    expect(codes('@raw(x')).toEqual(['FUD0130']);
    expect(shape('@raw(x')).toEqual([['css-text', '@raw(x']]);
  });

  it('resumes scanning right after the rejected keyword', () => {
    const source = '@if @gap';
    expect(shape(source)).toEqual([
      ['css-text', '@if '],
      ['razor-expression', '@gap'],
    ]);
  });
});

describe('Razor comments in CSS (§4.2, decision 37)', () => {
  it('produces a RazorCommentNode', () => {
    const source = 'a { @* nota *@ color: red; }';
    expect(shape(source)).toEqual([
      ['css-text', 'a { '],
      ['razor-comment', '@* nota *@'],
      ['css-text', ' color: red; }'],
    ]);
  });

  it('does not count braces inside a Razor comment', () => {
    expect(codes('@* { *@')).toEqual([]);
  });

  it('reports FUD0011 when it is never closed', () => {
    const source = 'a { @* nota';
    const { node, diagnostics } = parse(source);
    // The comment runs to the end of the body, so the `{` is unclosed too.
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0011', 'FUD0131']);
    expect(node.parts.at(-1)?.type).toBe('razor-comment');
    assertTiles(source, node);
  });
});

describe('robustness (§5: never throws)', () => {
  it('accepts an empty body', () => {
    const { node, diagnostics } = parse('');
    expect(node.parts).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(node.span).toEqual(span(0, 0));
  });

  it('clamps a body span that runs past the end of the source', () => {
    const source = '.a { }';
    const { value, diagnostics } = parseStyle(source, span(0, 999));
    expect(value.span).toEqual(span(0, 6));
    expect(diagnostics).toEqual([]);
  });

  it('clamps a body span whose start is past its clamped end', () => {
    const source = '.a { }';
    const { value } = parseStyle(source, span(50, 999));
    expect(value.span).toEqual(span(6, 6));
    expect(value.parts).toEqual([]);
  });

  it('scans only the requested slice of a larger source', () => {
    const source = 'PRE<style>.a { gap: @g; }</style>POST';
    const body = span(10, 25);
    const { value } = parseStyle(source, body);
    expect(value.span).toEqual(body);
    assertTiles(source, value);
    expect(value.parts.map((p) => p.type)).toEqual(['css-text', 'razor-expression', 'css-text']);
  });
});
