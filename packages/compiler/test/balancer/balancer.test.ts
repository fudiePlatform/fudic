/**
 * SDD-02 acceptance criteria (§6) for the delimiter balancer.
 */

import { describe, expect, it } from 'vitest';
import {
  scanBalanced,
  scanBraces,
  scanBrackets,
  scanParens,
  type BalancedGroup,
  type LexRegionKind,
} from '../../src/balancer/index.js';
import { emptySpan, span } from '../../src/types/index.js';

/** Compact view of the regions, for order-and-extent assertions. */
function regionsOf(group: BalancedGroup): [LexRegionKind, number, number][] {
  return group.regions.map((r) => [r.kind, r.span.start, r.span.end]);
}

describe('scanBalanced — nested balancing (§6.2)', () => {
  it('balances nested parens', () => {
    const { value, diagnostics } = scanParens('(a(b)c)', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 7));
    expect(value.inner).toEqual(span(1, 6));
    expect(value.regions).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('balances nested brackets', () => {
    const { value } = scanBrackets('[a[b]c]', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 7));
    expect(value.inner).toEqual(span(1, 6));
  });

  it('balances nested braces', () => {
    const { value } = scanBraces('{a{b}c}', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 7));
    expect(value.inner).toEqual(span(1, 6));
  });

  it('yields an empty inner span for an empty group', () => {
    const { value } = scanParens('()', 0);
    expect(value.closed).toBe(true);
    expect(value.inner).toEqual(span(1, 1));
  });

  it('counts each delimiter type independently: `( ] )` closes at the paren (§4.2)', () => {
    const { value } = scanParens('(a])', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 4));
  });

  it('does not let a brace group close the enclosing parens', () => {
    const { value } = scanParens('({a:1})', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 7));
  });
});

describe('scanBalanced — delimiters inside opaque regions do not count (§6.3)', () => {
  it('skips a string', () => {
    const { value } = scanParens('("a)b")', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 7));
    expect(regionsOf(value)).toEqual([['string', 1, 6]]);
  });

  it('skips a block comment', () => {
    const { value } = scanParens('(/* ) */)', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 9));
    expect(regionsOf(value)).toEqual([['block-comment', 1, 8]]);
  });

  it('skips a regex, class included', () => {
    const { value } = scanParens('(/[)]/)', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 7));
    expect(regionsOf(value)).toEqual([['regex', 1, 6]]);
  });

  it('skips an escaped slash inside a regex', () => {
    const { value } = scanParens('(/a\\/b/)', 0);
    expect(value.closed).toBe(true);
    expect(regionsOf(value)).toEqual([['regex', 1, 7]]);
  });

  it('does not end a string at an escaped quote', () => {
    const { value } = scanParens("('a\\')b')", 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 9));
    expect(regionsOf(value)).toEqual([['string', 1, 8]]);
  });

  it('skips a line comment and resumes on the next line', () => {
    const { value, diagnostics } = scanParens('(a // )\n)', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 9));
    expect(regionsOf(value)).toEqual([['line-comment', 3, 7]]);
    expect(diagnostics).toEqual([]);
  });

  it('accepts a line comment running to EOF as terminated', () => {
    const { value, diagnostics } = scanParens('(a // x', 0);
    expect(value.closed).toBe(false);
    expect(regionsOf(value)).toEqual([['line-comment', 3, 7]]);
    // Only the group is unterminated; the comment itself is never an error.
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0002']);
  });
});

describe('scanBalanced — template interpolations reopen counting (§6.4)', () => {
  it('balances a paren opened inside a `${}` substitution', () => {
    const { value, diagnostics } = scanParens('(`x${ f(`)`) }y`)', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 17));
    expect(value.inner).toEqual(span(1, 16));
    expect(diagnostics).toEqual([]);
    // The outer template covers the whole literal, interpolations included; the
    // template nested inside the interpolation is listed on its own.
    expect(regionsOf(value)).toEqual([
      ['template', 1, 16],
      ['template', 8, 11],
    ]);
  });

  it('does not end a template at an escaped backtick', () => {
    const { value } = scanParens('(`a\\`b`)', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 8));
    expect(regionsOf(value)).toEqual([['template', 1, 7]]);
  });

  it('does not let a brace inside a template close the group', () => {
    const { value } = scanBraces('{ `a}b` }', 0);
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 9));
  });
});

describe('scanBalanced — regex vs division (§6.5)', () => {
  const regexCount = (source: string): number =>
    scanParens(source, 0).value.regions.filter((r) => r.kind === 'regex').length;

  it('reads `/` after an identifier as division', () => {
    expect(regexCount('(a / b)')).toBe(0);
  });

  it('reads `/` after `return` as a regex', () => {
    const { value } = scanParens('(return /x/)', 0);
    expect(regionsOf(value)).toEqual([['regex', 8, 11]]);
  });

  it('reads `/` after `=>` as a regex', () => {
    expect(regexCount('(x => /a/)')).toBe(1);
  });

  it('reads `/` after a closing paren as division', () => {
    expect(regexCount('(f() /2/g)')).toBe(0);
  });

  it('reads `/` after a comma as a regex', () => {
    expect(regexCount('([1] , /a/)')).toBe(1);
  });

  it('reads `/` after a numeric literal as division', () => {
    expect(regexCount('(0x1F / 2)')).toBe(0);
  });

  it('reads `/` after a string as division — comments are not significant (§4.4)', () => {
    expect(regexCount('("s" /* c */ / 2)')).toBe(0);
  });

  it('reads `/` after a closing brace as a regex (documented v1 edge, §4.4)', () => {
    expect(regexCount('({} /a/)')).toBe(1);
  });
});

describe('scanBalanced — EOF degradation (§6.6)', () => {
  it('reports FUD0002 when the group itself runs out of source', () => {
    const { value, diagnostics } = scanParens('(a + b', 0);
    expect(value.closed).toBe(false);
    expect(value.span).toEqual(span(0, 6));
    expect(value.inner).toEqual(span(1, 6));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('FUD0002');
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.span).toEqual(emptySpan(6));
  });

  it('reports the specific FUD0003 for an unterminated string, not FUD0002', () => {
    const { value, diagnostics } = scanParens('("abc)', 0);
    expect(value.closed).toBe(false);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0003']);
  });

  it('reports FUD0004 for an unterminated template', () => {
    const { value, diagnostics } = scanParens('(`abc)', 0);
    expect(value.closed).toBe(false);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0004']);
  });

  it('reports FUD0005 for an unterminated block comment', () => {
    const { value, diagnostics } = scanParens('(/* abc)', 0);
    expect(value.closed).toBe(false);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0005']);
  });

  it('reports FUD0006 for a regex unterminated on its line', () => {
    const { value, diagnostics } = scanParens('(/abc)', 0);
    expect(value.closed).toBe(false);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0006']);
  });

  it('ends a string at the line break and resumes counting after it', () => {
    const { value, diagnostics } = scanParens("('abc\n)", 0);
    // The string is unterminated, but scanning recovers past the line break, so
    // the group itself still closes: degraded value, one diagnostic.
    expect(value.closed).toBe(true);
    expect(value.span).toEqual(span(0, 7));
    expect(regionsOf(value)).toEqual([['string', 1, 5]]);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0003']);
  });

  it('does not run past EOF on a trailing backslash', () => {
    const { value, diagnostics } = scanParens("('abc\\", 0);
    expect(value.closed).toBe(false);
    expect(value.span).toEqual(span(0, 6));
    expect(regionsOf(value)).toEqual([['string', 1, 6]]);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0003']);
  });
});

describe('scanBalanced — wrong opener (§6.7)', () => {
  it('returns an empty degraded group with FUD0007 and does not scan', () => {
    const { value, diagnostics } = scanParens('xyz', 0);
    expect(value.closed).toBe(false);
    expect(value.span).toEqual(emptySpan(0));
    expect(value.inner).toEqual(emptySpan(0));
    expect(value.regions).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('FUD0007');
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.span).toEqual(emptySpan(0));
  });

  it('rejects an offset past the end of source', () => {
    const { diagnostics } = scanBraces('{}', 99);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0007']);
  });

  it('rejects the wrong delimiter type at the offset', () => {
    expect(scanBrackets('(a)', 0).diagnostics.map((d) => d.code)).toEqual(['FUD0007']);
    expect(scanBalanced('[a]', 0, '}').diagnostics.map((d) => d.code)).toEqual(['FUD0007']);
  });
});

describe('scanBalanced — region table (§6.8)', () => {
  it('lists every region in source order with exact spans', () => {
    const { value } = scanParens('( "s" /* c */ , /re/ )', 0);
    expect(value.closed).toBe(true);
    expect(regionsOf(value)).toEqual([
      ['string', 2, 5],
      ['block-comment', 6, 13],
      ['regex', 16, 20],
    ]);
  });

  it('keeps regex flags inside the region span', () => {
    const { value } = scanParens('(x = /a/gi)', 0);
    expect(regionsOf(value)).toEqual([['regex', 5, 10]]);
  });
});

describe('scanBalanced — purity (§5)', () => {
  it('returns an equal result for the same arguments', () => {
    const source = '(a `t${ /re/ }` "s")';
    expect(scanParens(source, 0)).toEqual(scanParens(source, 0));
  });
});
