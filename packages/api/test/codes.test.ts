import { describe, expect, it } from 'vitest';
import { only, slice } from './helpers.js';

/** Each parser code with a minimal input and the exact text its span covers (criterion 4). */
const CASES: readonly (readonly [code: string, source: string, covered: string, says: string])[] = [
  ['FUD1060', 'messages\n  required  "abc', '"abc', ''],
  ['FUD1061', 'type A\n\t\tx  str', '\t\t', 'tab'],
  ['FUD1061', 'type A\n   x  str', '   ', ''],
  ['FUD1061', 'type A\n    x  str', '    ', ''],
  ['FUD1062', 'frob x', 'frob', 'frob'],
  ['FUD1063', 'type', 'type', 'type'],
  ['FUD1064', 'paths extra words', 'extra words', 'extra words'],
  ['FUD1065', 'chain\n  frob', 'frob', '`use`, `skip`, `compress`'],
  ['FUD1066', '  x  str', 'x  str', ''],
  ['FUD1067', 'type A\n  x  str[', 'str[', 'str['],
  ['FUD1068', 'form f\n  x  str = nope', 'nope', 'initial value'],
  ['FUD1068', 'get f\n  fails taken abc', 'abc', 'status'],
  ['FUD1068', 'get f nope', 'nope', 'route'],
  ['FUD1068', 'messages\n  required  nope', 'nope', 'double-quoted'],
  ['FUD1068', 'chain\n  compress gzip big', 'big', 'whole number'],
  ['FUD1069', 'form f\n  x  str\n  summary\n    require c  x == )', ')', ')'],
  ['FUD1070', 'type person\n  x  str', 'person', 'person'],
  ['FUD1071', 'get f\n  -> str\n  -> i32', '->', '->'],
  ['FUD1072', 'put f\n  form g\n  x  str', 'form g', ''],
  ['FUD1073', 'type A', 'A', 'type'],
  ['FUD1074', 'load fast', 'fast', 'fast'],
  ['FUD1075', 'get f\n  fails taken 200', '200', '200'],
  ['FUD1075', 'chain\n  compress brotli', 'brotli', 'brotli'],
  ['FUD1076', 'get f\n  query a  str', 'a', '`a`'],
  ['FUD1077', 'pattern p  [', '[', ''],
  ['FUD1078', 'get f\nrule r', 'rule', 'rule'],
  ['FUD1079', 'chain\nchain', 'chain', ''],
];

describe('each parser code (criterion 4)', () => {
  for (const [code, source, covered, says] of CASES) {
    it(`${code} on ${JSON.stringify(covered)}`, () => {
      const d = only(source);
      expect(d.code).toBe(code);
      expect(slice(source, d.span)).toBe(covered);
      expect(d.message).toContain(says);
    });
  }

  it('covers every code of the parser range', () => {
    const covered = new Set(CASES.map(([code]) => code));
    for (let n = 1060; n <= 1079; n++) expect(covered).toContain(`FUD${n}`);
  });

  it('FUD1078 points at the declaration that made the file what it is', () => {
    const source = 'get f\nrule r';
    expect(only(source).related!.map((r) => slice(source, r.span))).toEqual(['get f']);
  });

  it('FUD1079 points at the first `chain`', () => {
    const source = 'chain\n  use log\nchain';
    const d = only(source);
    expect(d.span.start).toBe(source.lastIndexOf('chain'));
    expect(d.related!.map((r) => slice(source, r.span))).toEqual(['chain\n  use log']);
  });

  it('the three kinds of bad indentation say different things', () => {
    const messages = ['type A\n\t\tx  str', 'type A\n   x  str', 'type A\n    x  str'].map((s) => only(s).message);
    expect(new Set(messages).size).toBe(3);
  });
});
