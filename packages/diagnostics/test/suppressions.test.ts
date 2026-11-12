/**
 * SDD-83 §3.2: the directive, read in one place for every language. Criteria 10 and 11 on the
 * function, and every way a comment can be written wrong.
 */

import { describe, expect, it } from 'vitest';
import { LineMap, readSuppressions, type SourceComment } from '../src/index.js';

/** The comments of `source` found by a marker: each `@*…*@`, `/*…*\/`, `//…` and `#…` line. */
function commentsOf(source: string): SourceComment[] {
  return [...source.matchAll(/@\*[\s\S]*?\*@|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*/gu)].map((m) => ({
    span: { start: m.index, end: m.index + m[0].length },
    text: m[0],
  }));
}

function read(source: string) {
  return readSuppressions(commentsOf(source), new LineMap(source));
}

describe('a directive written right', () => {
  it('fud-disable-next-line covers the line after the comment (criterion 7)', () => {
    const comment = '@* fud-disable-next-line FUD1380: demo *@';
    const source = `a\n${comment}\nb`;
    expect(read(source)).toEqual({
      suppressions: [{ codes: ['FUD1380'], scope: 'next-line', span: { start: 2, end: 2 + comment.length }, line: 2 }],
      diagnostics: [],
    });
  });

  it('a comment of several lines covers the line after its LAST line', () => {
    const source = '/* fud-disable-next-line FUD1380:\n   a reason on two lines */\nx';
    expect(read(source).suppressions[0]).toMatchObject({ line: 2 });
  });

  it('fud-disable covers the file, wherever it is (criterion 8)', () => {
    const comment = '# fud-disable FUD1380: whole file';
    expect(read(`x\ny\n${comment}`).suppressions).toEqual([
      { codes: ['FUD1380'], scope: 'file', span: { start: 4, end: 4 + comment.length } },
    ]);
  });

  it('several codes, a repeated one once, in every language', () => {
    for (const source of [
      '@* fud-disable FUD1380, FUD1022,FUD1380: r *@',
      '/** fud-disable FUD1380, FUD1022, FUD1380: r */',
      '// fud-disable FUD1380 , FUD1022, FUD1380 : r',
      '# fud-disable FUD1380, FUD1022, FUD1380: r',
    ]) {
      expect(read(source).suppressions[0]?.codes, source).toEqual(['FUD1380', 'FUD1022']);
    }
  });

  it('a text handed over without delimiters is read as it is', () => {
    const text = 'fud-disable FUD1380: r';
    expect(readSuppressions([{ span: { start: 0, end: text.length }, text }], new LineMap(text)).suppressions).toEqual([
      { codes: ['FUD1380'], scope: 'file', span: { start: 0, end: text.length } },
    ]);
  });

  it('a comment that is not a directive is no business of this', () => {
    expect(read('// just a note about fud-disable\n/* fud */')).toEqual({ suppressions: [], diagnostics: [] });
  });
});

describe('a directive written wrong is FUD1522 and silences nothing (criterion 10)', () => {
  const cases: readonly [string, string][] = [
    ['@* fud-disable FUD1380 *@', 'it gives no reason after the codes'],
    ['@* fud-disable FUD1380:   *@', 'it gives no reason after the codes'],
    ['@* fud-disable: no code *@', 'it names no code'],
    ['@* fud-disable *@', 'it names no code'],
    ['@* fud-disable-line FUD1380: r *@', 'it is neither `fud-disable` nor `fud-disable-next-line`'],
    ['@* fud-disable fud1380: r *@', '"fud1380" is not a code'],
    ['@* fud-disable FUD1380,, FUD1022: r *@', 'a code is missing between two commas'],
  ];
  for (const [source, reason] of cases) {
    it(source, () => {
      const result = read(source);
      expect(result.suppressions).toEqual([]);
      expect(result.diagnostics.map((d) => [d.code, d.message.includes(reason), d.span])).toEqual([
        ['FUD1522', true, { start: 0, end: source.length }],
      ]);
    });
  }
});

describe('a code that cannot be silenced', () => {
  it('an error is FUD1521 on the code, and the other codes still apply (criterion 11)', () => {
    const source = '// fud-disable-next-line FUD0051, FUD1380: r';
    const result = read(source);
    expect(result.suppressions.map((s) => s.codes)).toEqual([['FUD1380']]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'FUD1521', severity: 'error', span: { start: 25, end: 32 } }),
    ]);
  });

  it('an unknown code is FUD1520, and a retired one names its replacement', () => {
    const source = '# fud-disable FUD9999, FUD0050: r';
    const result = read(source);
    expect(result.suppressions).toEqual([]);
    expect(result.diagnostics.map((d) => [d.code, d.span, d.message])).toEqual([
      ['FUD1520', { start: 14, end: 21 }, 'FUD9999 is not a fudic code, so this comment does not silence it'],
      [
        'FUD1520',
        { start: 23, end: 30 },
        'FUD0050 is retired: it was replaced by FUD0052, FUD0051, so this comment does not silence it',
      ],
    ]);
  });
});
