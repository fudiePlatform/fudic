/**
 * BUG-47 §4.5 — a piece's sibling URLs move to the fingerprinted segment as it is copied, and
 * its map moves with it (criterion 11).
 */

import { describe, expect, it } from 'vitest';
import { rewritePieceUrls } from '../src/piece-rewrite.js';
import { decodeMappings } from './helpers/vlq.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(n: number): string {
  let value = n < 0 ? (-n << 1) | 1 : n << 1;
  let out = '';
  do {
    let digit = value & 31;
    value >>>= 5;
    if (value > 0) digit |= 32;
    out += ALPHABET.charAt(digit);
  } while (value > 0);
  return out;
}

/** A map whose line `i` has one segment per generated column in `lines[i]`, in that order. */
function mapOf(lines: readonly (readonly number[])[]): string {
  const mappings = lines
    .map((columns) => {
      let previous = 0;
      return columns
        .map((column) => {
          const out = `${vlq(column - previous)}AAA`;
          previous = column;
          return out;
        })
        .join(',');
    })
    .join(';');
  return JSON.stringify({ version: 3, sources: ['a.ts'], names: [], mappings });
}

/** The generated columns of each line of a serialized map, in segment order. */
function columns(map: string): number[][] {
  const { mappings } = JSON.parse(map) as { mappings: string };
  const out: number[][] = mappings.split(';').map(() => []);
  for (const p of decodeMappings(mappings)) out[p.generatedLine]!.push(p.generatedColumn);
  return out;
}

const SEGMENTS = new Map([
  ['0.0.1/dom', '0.0.1-abcdef12'],
  ['0.0.1/core', '0.0.1-12345678'],
]);

/** The `-<8 hex>` every rewritten segment grows by. */
const GROWTH = '-abcdef12'.length;

describe('rewritePieceUrls — the code', () => {
  it('rewrites the version segment of every known sibling URL', () => {
    const code = 'import"/_fudic/0.0.1/dom/browser.js";import(`/_fudic/0.0.1/core/signal.js`);';
    expect(rewritePieceUrls({ code }, SEGMENTS)).toEqual({
      code: 'import"/_fudic/0.0.1-abcdef12/dom/browser.js";import(`/_fudic/0.0.1-12345678/core/signal.js`);',
    });
  });

  it('leaves a URL of a publisher it does not know, and hands the piece back as it was', () => {
    const piece = { code: 'import"/_fudic/9.9.9/ghost/x.js";', map: mapOf([[0, 7]]) };
    expect(rewritePieceUrls(piece, SEGMENTS)).toBe(piece);
  });

  it('a piece without a map comes back without one', () => {
    const out = rewritePieceUrls({ code: 'import"/_fudic/0.0.1/dom/browser.js";' }, SEGMENTS);
    expect('map' in out).toBe(false);
  });
});

describe('rewritePieceUrls — the map moves with the code', () => {
  const URL = '/_fudic/0.0.1/dom/browser.js';

  it('a column after the cut moves by the growth; one before it, or at its start, does not', () => {
    const code = `import"${URL}";export{a};`;
    const at = code.indexOf('0.0.1');
    const after = code.indexOf('export');
    const out = rewritePieceUrls({ code, map: mapOf([[0, at, after]]) }, SEGMENTS);
    expect(columns(out.map!)).toEqual([[0, at, after + GROWTH]]);
    // And the moved column still points at the same text.
    expect(out.code.slice(after + GROWTH, after + GROWTH + 'export'.length)).toBe('export');
  });

  it('two cuts on one line add up', () => {
    const code = `import"${URL}";import"/_fudic/0.0.1/core/signal.js";x;`;
    const between = code.indexOf(';import') + 1;
    const end = code.lastIndexOf('x');
    const out = rewritePieceUrls({ code, map: mapOf([[between, end]]) }, SEGMENTS);
    expect(columns(out.map!)).toEqual([[between + GROWTH, end + 2 * GROWTH]]);
  });

  it('only the lines with a cut are touched, an empty line included', () => {
    const code = `a;\n\nimport"${URL}";b;`;
    const b = `import"${URL}";`.length;
    const map = mapOf([[0, 1], [], [0, b]]);
    const out = rewritePieceUrls({ code, map }, SEGMENTS);
    const before = (JSON.parse(map) as { mappings: string }).mappings.split(';');
    const after = (JSON.parse(out.map!) as { mappings: string }).mappings.split(';');
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe('');
    expect(columns(out.map!)[2]).toEqual([0, b + GROWTH]);
  });

  it('a line with a cut and an empty segment keeps the empty segment', () => {
    const code = `import"${URL}";`;
    const map = JSON.stringify({ version: 3, sources: ['a.ts'], names: [], mappings: 'AAAA,,CAAA' });
    const out = rewritePieceUrls({ code, map }, SEGMENTS);
    expect((JSON.parse(out.map!) as { mappings: string }).mappings).toBe('AAAA,,CAAA');
  });

  it('negative and multi-digit VLQ: segments out of order, columns past 15', () => {
    const code = `${' '.repeat(40)}import"${URL}";${' '.repeat(60)}z;`;
    const z = code.indexOf('z');
    // `z` after the cut (multi-digit), then column 3 before it (a negative delta), then `z` again.
    const out = rewritePieceUrls({ code, map: mapOf([[z, 3, z]]) }, SEGMENTS);
    expect(columns(out.map!)).toEqual([[z + GROWTH, 3, z + GROWTH]]);
  });

  it('the rest of the map is kept', () => {
    const map = JSON.stringify({ version: 3, file: 'browser.js', sources: ['a.ts'], sourcesContent: ['x'], names: ['n'], mappings: 'AAAA' });
    const out = rewritePieceUrls({ code: `import"${URL}";`, map }, SEGMENTS);
    expect(JSON.parse(out.map!)).toEqual({ ...JSON.parse(map), mappings: 'AAAA' });
  });
});
