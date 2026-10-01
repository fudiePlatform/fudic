/**
 * SDD-09 acceptance criteria (§6) for the `<style>` body. Decision 136 (SDD-49) made it plain
 * CSS: the criteria about Razor inside it are gone with it, and its own (criterion 43 of
 * SDD-49) are still to be written.
 */

import { describe, expect, it } from 'vitest';
import {
  CSS_AT_RULES,
  atRuleNameEnd,
  isCssAtRule,
  parseStyle,
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

describe('§6.7 comments and strings are inert (§4.1)', () => {
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
