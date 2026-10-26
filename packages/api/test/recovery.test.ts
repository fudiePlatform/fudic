import { describe, expect, it } from 'vitest';
import { formatApi, parseApi, type Decl } from '../src/index.js';
import { SWEEP, USUARIOS, codes, inputs, shape, slice, spansOf } from './helpers.js';

const kinds = (source: string): readonly string[] =>
  parseApi(source).value.declarations.map((d: Decl) => ('name' in d ? `${d.kind} ${d.name.text}` : d.kind));

const edit = (from: string, to: string): string => {
  expect(USUARIOS).toContain(from);
  return USUARIOS.replace(from, to);
};

describe('recovery (criterion 5)', () => {
  it('an indentation of 3 is one diagnostic and the line stays where it was meant', () => {
    const source = edit('  q  str', '   q  str');
    expect(codes(source)).toEqual(['FUD1061']);
    expect(shape(parseApi(source).value)).toEqual(shape(parseApi(USUARIOS).value));
  });

  it('a half-written word is one diagnostic and the rest of the file stays in the tree', () => {
    const source = edit('get search', 'ge search');
    expect(codes(source)).toEqual(['FUD1062']);
    expect(kinds(source)).toEqual(['load', 'fn save', 'type Person']);
  });

  it('an unknown clause is one diagnostic and its function keeps the rest', () => {
    // A lone word: two words would read as an argument and its type, which the validator checks.
    const source = edit('  use auth', '  use auth\n  cache');
    expect(codes(source)).toEqual(['FUD1065']);
    const save = parseApi(source).value.declarations[2] as Extract<Decl, { kind: 'fn' }>;
    expect(save.uses).toHaveLength(1);
    expect(save.args.map((a) => a.name.text)).toEqual(['id', 'active']);
  });

  it('the three at once give three diagnostics, in order', () => {
    const source = edit('  q  str', '   q  str').replace('get search', 'ge search').replace('  use auth', '  use auth\n  cache');
    expect(codes(source)).toEqual(['FUD1062', 'FUD1061', 'FUD1065']);
    expect(kinds(source)).toEqual(['load', 'fn save', 'type Person']);
  });

  it('nothing below a line that cannot be placed is reported', () => {
    expect(codes('frob\n  a  b\n    c  d\n  e')).toEqual(['FUD1062']);
    expect(codes('get f\n  frob\n    deeper  still\n  q  str')).toEqual(['FUD1065']);
  });

  it('each indented line with no parent is reported, and nothing that hangs from one', () => {
    expect(codes('  a  str\n    b  str\n      c  str\ntype A\n  x  str')).toEqual(['FUD1066']);
    expect(codes('  a  str\n    b  str\n  c  str')).toEqual(['FUD1066', 'FUD1066']);
    const two = '    a  str\n  b  str';
    expect(codes(two)).toEqual(['FUD1066', 'FUD1066']);
  });

  it('a declaration that cannot be built does not end the file', () => {
    expect(kinds('type\nget f\nenum\nform\nrule\nmiddleware\npattern\nget\ntype B\n  x  str')).toEqual([
      'fn f',
      'type B',
    ]);
  });
});

describe('never throws (criterion 6)', () => {
  it('over every prefix, indentation and stray character of the canonicals', () => {
    let count = 0;
    for (const source of inputs()) {
      count++;
      const { value, diagnostics } = parseApi(source);
      for (const [path, s] of [...spansOf(value), ...spansOf(diagnostics)]) {
        if (s.start < 0 || s.start > s.end || s.end > source.length) {
          throw new Error(`${path} ${JSON.stringify(s)} out of ${JSON.stringify(source)}`);
        }
      }
      expect(() => formatApi(source)).not.toThrow();
    }
    expect(count).toBeGreaterThan(1000);
  }, SWEEP);

  it('over inputs made of the characters that break things', () => {
    for (const source of ['', '\r', '\n', '\r\n\r', '\t', '"', '\\', '#', '  ', '"\\', 'type "', 'pattern', 'pattern p', '\t\ttype A']) {
      const { value } = parseApi(source);
      expect(slice(source, value.span)).toBe(source);
    }
  });
});
