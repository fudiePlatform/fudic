import type { SourceDiagnostic } from '@fudic/diagnostics';
import { describe, expect, it } from 'vitest';
import { lineTree, readLine } from '../src/line.js';
import { parseApi, type Decl } from '../src/index.js';
import { slice } from './helpers.js';

const read = (source: string): ReturnType<typeof readLine> => readLine(source, 0, source.length, []);

describe('the line reader', () => {
  it('cuts tokens on blanks, keeping a quoted section with its blanks in one token', () => {
    const line = read('  min-length 3   "al menos {n} caracteres"');
    expect(line.indent).toBe(2);
    expect(line.tokens.map((t) => t.raw)).toEqual(['min-length', '3', '"al menos {n} caracteres"']);
  });

  it('unescapes `\\"` and `\\\\` and keeps any other backslash', () => {
    const source = 'messages\n  x  "a \\"q\\" \\\\ \\n b"';
    const { value, diagnostics } = parseApi(source);
    expect(diagnostics).toEqual([]);
    const entry = (value.declarations[0] as Extract<Decl, { kind: 'messages' }>).entries[0]!;
    expect(entry.text.text).toBe('a "q" \\ \\n b');
    expect(slice(source, entry.text.span)).toBe('"a \\"q\\" \\\\ \\n b"');
  });

  it('a quote glued to a word stays in its token', () => {
    expect(read('a"b c"d e').tokens.map((t) => t.raw)).toEqual(['a"b c"d', 'e']);
  });

  it('a `#` opens a comment only where it opens a token', () => {
    const line = read('a#b "c # d" # tail');
    expect(line.tokens.map((t) => t.raw)).toEqual(['a#b', '"c # d"']);
    expect(line.comment).toEqual({ start: 12, end: 18 });
  });

  it('a lone `=` is a token of its own, glued or not', () => {
    const raw = (s: string): readonly string[] => read(s).tokens.map((t) => t.raw);
    for (const line of ['name str=""', 'name str= ""', 'name str =""', 'name str = ""']) {
      expect(raw(line), line).toEqual(['name', 'str', '=', '""']);
    }
    expect(raw('a=3')).toEqual(['a', '=', '3']);
    expect(raw('=')).toEqual(['=']);
    expect(read('a=b').tokens.map((t) => t.span)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
      { start: 2, end: 3 },
    ]);
  });

  it('an `=` of `==`, `!=`, `<=` or `>=`, or inside quotes, stays where it is', () => {
    const raw = (s: string): readonly string[] => read(s).tokens.map((t) => t.raw);
    for (const op of ['==', '!=', '<=', '>=']) expect(raw(`a${op}b`)).toEqual([`a${op}b`]);
    expect(raw('x="a=b"')).toEqual(['x', '=', '"a=b"']);
    expect(read('x="a=b"').tokens[2]!.quoted.map((q) => q.text)).toEqual(['a=b']);
  });

  it('the rest of a level-0 `pattern` keeps its `=`; an indented one is cut like any line', () => {
    expect(read('pattern p  a=b /=?').tokens.map((t) => t.raw)).toEqual(['pattern', 'p', 'a=b /=?']);
    expect(read('    pattern p  a=b').tokens.map((t) => t.raw)).toEqual(['pattern', 'p', 'a', '=', 'b']);
  });

  it('a tab in the indentation is marked', () => {
    expect(read(' \tx').tabbed).toBe(true);
    expect(read('  x').tabbed).toBe(false);
  });

  it('an unclosed quote ends at the end of its line, reported once', () => {
    const out: SourceDiagnostic[] = [];
    const line = readLine('x "ab\nnext', 0, 5, out);
    expect(line.tokens.map((t) => t.raw)).toEqual(['x', '"ab']);
    expect(out.map((d) => [d.code, d.span])).toEqual([['FUD1060', { start: 2, end: 5 }]]);
  });
});

describe('the line tree', () => {
  it('hangs lines by level and drops comment and blank lines', () => {
    const roots = lineTree('a\n  b\n\n  # c\n  d\n    e\nf', []);
    expect(roots.map((r) => [r.tokens[0]!.raw, r.children.map((c) => [c.tokens[0]!.raw, c.children.length])])).toEqual([
      ['a', [['b', 0], ['d', 1]]],
      ['f', []],
    ]);
    expect(roots[0]!.children[1]!.doc).toBe('c');
  });

  it('a string line deeper than the children continues the line above', () => {
    const source = 'a b\n      "text"\n  c';
    const roots = lineTree(source, []);
    expect(roots[0]!.tokens.map((t) => t.raw)).toEqual(['a', 'b', '"text"']);
    expect(slice(source, roots[0]!.span)).toBe('a b\n      "text"');
    expect(roots[0]!.children.map((c) => c.tokens[0]!.raw)).toEqual(['c']);
  });

  it('a string line at the children level is a child, not a continuation', () => {
    expect(lineTree('a\n  "text"', [])[0]!.children).toHaveLength(1);
  });

  it('a tabbed string line is never a continuation', () => {
    const out: SourceDiagnostic[] = [];
    const roots = lineTree('a\n\t\t\t\t"text"', out);
    expect(roots[0]!.tokens).toHaveLength(1);
    expect(out.map((d) => d.code)).toEqual(['FUD1061']);
  });

  it('a string line with nothing above is not a continuation', () => {
    const out: SourceDiagnostic[] = [];
    expect(lineTree('      "text"', out)).toEqual([]);
    expect(out.map((d) => d.code)).toEqual(['FUD1066']);
  });

  it('an odd indentation that also jumps is reported once', () => {
    const out: SourceDiagnostic[] = [];
    const roots = lineTree('a\n     b', out);
    expect(out.map((d) => d.code)).toEqual(['FUD1061']);
    expect(roots[0]!.children.map((c) => c.level)).toEqual([1]);
  });

  it('a tabbed indentation that also jumps is reported once', () => {
    const out: SourceDiagnostic[] = [];
    lineTree('a\n\t\t\t\tb', out);
    expect(out.map((d) => d.code)).toEqual(['FUD1061']);
  });
});

describe('`when` drops a `require` it cannot read', () => {
  it('and keeps the others', () => {
    const source = 'form f\n  a  str\n  summary\n    when a\n      require\n      require y  a';
    const { value, diagnostics } = parseApi(source);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD1063']);
    const when = (value.declarations[0] as Extract<Decl, { kind: 'form' }>).summary!.items[0]!;
    expect(when.kind === 'when' && when.rules.map((r) => r.code.text)).toEqual(['y']);
  });
});
