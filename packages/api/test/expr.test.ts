import type { SourceDiagnostic } from '@fudic/diagnostics';
import { describe, expect, it } from 'vitest';
import type { Expr } from '../src/index.js';
import { parseExpr } from '../src/expr.js';
import { slice } from './helpers.js';

/** The expression with its grouping made explicit. */
function show(e: Expr): string {
  switch (e.kind) {
    case 'path':
      return e.segments.map((s) => s.text).join('.');
    case 'literal':
      return e.literal.kind === 'string' ? JSON.stringify(e.literal.text) : String(e.literal.value);
    case 'call':
      return `${e.fn.text}(${show(e.arg)})`;
    case 'not':
      return `not(${show(e.operand)})`;
    case 'binary':
      return `(${show(e.left)} ${e.op} ${show(e.right)})`;
    case 'group':
      return `[${show(e.inner)}]`;
  }
}

function read(source: string): { expr?: Expr; out: SourceDiagnostic[] } {
  const out: SourceDiagnostic[] = [];
  const expr = parseExpr(source, 0, source.length, out);
  return { ...(expr !== undefined ? { expr } : {}), out };
}

const parsed = (source: string): string => {
  const { expr, out } = read(source);
  expect(out).toEqual([]);
  return show(expr!);
};

describe('the expression of `require` and `when`', () => {
  it('reads or < and < not < comparison < valid/empty/length', () => {
    expect(parsed('a or b and c')).toBe('(a or (b and c))');
    expect(parsed('a and b or c')).toBe('((a and b) or c)');
    expect(parsed('not a == b')).toBe('not((a == b))');
    expect(parsed('not a.b contains c')).toBe('not((a.b contains c))');
    expect(parsed('empty name or not acceso.clave contains name')).toBe(
      '(empty(name) or not((acceso.clave contains name)))',
    );
    expect(parsed('length tags > 3 and valid email')).toBe('((length(tags) > 3) and valid(email))');
    expect(parsed('not not a')).toBe('not(not(a))');
    expect(parsed('a or b or c')).toBe('((a or b) or c)');
  });

  it('reads every comparison', () => {
    for (const op of ['==', '!=', '<', '<=', '>', '>=', 'contains']) expect(parsed(`a ${op} b`)).toBe(`(a ${op} b)`);
  });

  it('keeps parentheses, glued or not', () => {
    expect(parsed('(a or b) and c')).toBe('([(a or b)] and c)');
    expect(parsed('(a)==b')).toBe('([a] == b)');
    expect(parsed('not(a)')).toBe('not([a])');
  });

  it('reads literals: numbers, negative and decimal, strings with escapes, booleans', () => {
    expect(parsed('age >= -1.5')).toBe('(age >= -1.5)');
    expect(parsed('name == "a \\"b\\" \\\\ c"')).toBe('(name == "a \\"b\\" \\\\ c")');
    expect(parsed('active == true or active == false')).toBe('((active == true) or (active == false))');
  });

  it('covers the exact text of every node', () => {
    const source = 'not (a.b contains "x") or length c >= 2';
    const { expr } = read(source);
    expect(slice(source, expr!.span)).toBe(source);
    const or = expr as Extract<Expr, { kind: 'binary' }>;
    expect(slice(source, or.opSpan)).toBe('or');
    const not = or.left as Extract<Expr, { kind: 'not' }>;
    expect(slice(source, not.keyword)).toBe('not');
    expect(slice(source, not.operand.span)).toBe('(a.b contains "x")');
    const path = ((not.operand as Extract<Expr, { kind: 'group' }>).inner as Extract<Expr, { kind: 'binary' }>)
      .left as Extract<Expr, { kind: 'path' }>;
    expect(path.segments.map((s) => slice(source, s.span))).toEqual(['a', 'b']);
    expect(slice(source, or.right.span)).toBe('length c >= 2');
  });

  it('reads a slice of a longer source', () => {
    const source = 'require x  a == b  "text"';
    const out: SourceDiagnostic[] = [];
    const expr = parseExpr(source, 11, 17, out);
    expect(out).toEqual([]);
    expect(slice(source, expr!.span)).toBe('a == b');
  });

  it('a string left open ends with the expression', () => {
    const { expr, out } = read('a == "open');
    expect(out).toEqual([]);
    expect(show(expr!)).toBe('(a == "open")');
  });

  const broken: readonly (readonly [string, string, string])[] = [
    ['a ==', '', 'end of line'],
    ['a b', 'b', 'b'],
    ['a == b == c', '==', '=='],
    ['a $ b', '$', '$'],
    ['(a', '', 'end of line'],
    ['(a b', 'b', 'b'],
    ['and', 'and', 'and'],
    ['a or contains', 'contains', 'contains'],
    ['valid 3', '3', '3'],
    ['not', '', 'end of line'],
    [')', ')', ')'],
    ['', '', 'end of line'],
  ];
  for (const [source, covered, near] of broken) {
    it(`reports ${JSON.stringify(source)} once, at ${JSON.stringify(covered)}`, () => {
      const { expr, out } = read(source);
      expect(expr).toBeUndefined();
      expect(out.map((d) => d.code)).toEqual(['FUD1069']);
      expect(slice(source, out[0]!.span)).toBe(covered);
      expect(out[0]!.message).toContain(near);
    });
  }
});
