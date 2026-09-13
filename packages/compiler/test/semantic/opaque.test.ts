/**
 * BUG-30 §3 — the one answer to «is this offset code, or is it text?».
 *
 * The mask is character for character on purpose: the two callers match a regular expression
 * over the result and report the offset it lands on, so a mask that shortened the text would
 * move every span after the first comment.
 */

import { describe, expect, it } from 'vitest';
import { scanBraces, type LexRegion } from '../../src/balancer/index.js';
import { maskOpaque } from '../../src/semantic/opaque.js';

/** The regions of `{ … }` at offset 0, as the balancer computes them for a `@code` body. */
function regionsOf(source: string): readonly LexRegion[] {
  return scanBraces(source, 0).value.regions;
}

describe('maskOpaque', () => {
  it('blanks a comment and a string, keeping every offset where it was', () => {
    const source = '{ const s = "@server"; // and @client\n}';
    const masked = maskOpaque(source, regionsOf(source), 0, source.length);
    expect(masked).toHaveLength(source.length);
    // `"@server"` is 9 characters, `// and @client` is 14; both come back as that many spaces.
    expect(masked).toBe(`{ const s = ${' '.repeat(9)}; ${' '.repeat(14)}\n}`);
    expect(masked.indexOf('const')).toBe(source.indexOf('const'));
  });

  it('keeps both line terminators, so lines and columns survive', () => {
    const source = '{ /* a\r\nb */ x; }';
    const masked = maskOpaque(source, regionsOf(source), 0, source.length);
    // `/* a` and `b */` blank to four spaces each; the CRLF between them stays a CRLF.
    expect(masked).toBe(`{ ${' '.repeat(4)}\r\n${' '.repeat(4)} x; }`);
  });

  it('returns the text untouched when there is nothing opaque in it', () => {
    const source = '{ const a = 1; }';
    expect(maskOpaque(source, regionsOf(source), 0, source.length)).toBe(source);
    expect(maskOpaque(source, [], 0, source.length)).toBe(source);
  });

  it('clips regions that fall outside the window, and blanks the part that falls inside', () => {
    const source = '{ "a"; const b = 1; "c"; }';
    const regions = regionsOf(source);
    // A window over `const b = 1;` alone: both strings are outside it.
    const from = source.indexOf('const');
    const to = source.indexOf(';', from) + 1;
    expect(maskOpaque(source, regions, from, to)).toBe('const b = 1;');
    // A window that cuts the first string in half blanks only the half it holds.
    expect(maskOpaque(source, regions, 3, 6)).toBe('  ;');
  });

  it('handles a region nested inside another (a string in a template interpolation)', () => {
    const source = '{ const t = `x ${"@server"} y`; }';
    const regions = regionsOf(source);
    expect(regions.map((r) => r.kind)).toEqual(['template', 'string']);
    const masked = maskOpaque(source, regions, 0, source.length);
    // The whole 18-character template goes, the nested string included: blanking a span
    // twice is blanking it once.
    expect(masked).toBe(`{ const t = ${' '.repeat(18)}; }`);
    expect(masked).toHaveLength(source.length);
  });
});
