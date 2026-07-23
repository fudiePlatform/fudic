/**
 * SDD-11 acceptance criteria (§6) for the Oxc integration `JsBatch`: one synthetic
 * buffer, a single `parseSync`, and offsets/errors mapped back to source.
 *
 * `parseSync` is spied (wrapping the real implementation) so the "exactly once
 * per file" invariant is verified for real rather than asserted by inspection.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSync } from 'oxc-parser';
import { JsBatch, type OxcNode } from '../../src/oxc/index.js';
import { span, type Span } from '../../src/types/index.js';

vi.mock('oxc-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('oxc-parser')>();
  return { ...actual, parseSync: vi.fn(actual.parseSync) };
});

beforeEach(() => {
  vi.clearAllMocks();
});

/** Span of the first occurrence of `sub` inside `source`. */
function at(source: string, sub: string): Span {
  const i = source.indexOf(sub);
  if (i < 0) throw new Error(`fixture bug: ${JSON.stringify(sub)} not in source`);
  return span(i, i + sub.length);
}

/** Narrow the ast() union to a single node. */
function node(v: OxcNode | readonly OxcNode[]): OxcNode {
  if (Array.isArray(v)) throw new Error('expected a single node, got a list');
  return v as OxcNode;
}

/** Narrow the ast() union to a statement list. */
function list(v: OxcNode | readonly OxcNode[]): readonly OxcNode[] {
  if (!Array.isArray(v)) throw new Error('expected a list, got a single node');
  return v as readonly OxcNode[];
}

describe('JsBatch — kinds and wrappers (§4.1)', () => {
  it('expression → the inner Expression, span covering the original text (crit. #2)', () => {
    const source = '<p>@(variant === "highlight")</p>';
    const sp = at(source, 'variant === "highlight"');
    const batch = new JsBatch(source);
    const id = batch.add('expression', sp);

    const { value, diagnostics } = batch.parse();
    expect(diagnostics).toEqual([]);

    const ast = node(value.ast(id));
    expect(ast.type).toBe('BinaryExpression');
    // The synthetic `( … )` wrapper is unwrapped; the node maps to the exact source.
    expect(value.mapSpan(ast.start, ast.end)).toEqual(sp);
    expect(source.slice(sp.start, sp.end)).toBe('variant === "highlight"');
  });

  it('module-statements with import → Statement[] incl. ImportDeclaration (crit. #3)', () => {
    const source = "import {db} from './db';\nasync function load(){}";
    const sp = span(0, source.length);
    const batch = new JsBatch(source);
    const id = batch.add('module-statements', sp);

    const { value, diagnostics } = batch.parse();
    expect(diagnostics).toEqual([]);

    const stmts = list(value.ast(id));
    expect(stmts.map((s) => s.type)).toEqual(['ImportDeclaration', 'FunctionDeclaration']);
  });

  it('block-statements → Statement[] with a VariableDeclaration (crit. #4)', () => {
    const source = 'const n = 1;';
    const batch = new JsBatch(source);
    const id = batch.add('block-statements', span(0, source.length));

    const { value, diagnostics } = batch.parse();
    expect(diagnostics).toEqual([]);

    const stmts = list(value.ast(id));
    expect(stmts).toHaveLength(1);
    expect(stmts[0]!.type).toBe('VariableDeclaration');
  });

  it('for-of-header → ForOfStatement, for-header → ForStatement (crit. #5)', () => {
    const source = 'const item of data.items ||| let i = 0; i < n; i++';
    const forOf = at(source, 'const item of data.items');
    const forC = at(source, 'let i = 0; i < n; i++');
    const batch = new JsBatch(source);
    const idOf = batch.add('for-of-header', forOf);
    const idFor = batch.add('for-header', forC);

    const { value, diagnostics } = batch.parse();
    expect(diagnostics).toEqual([]);

    expect(node(value.ast(idOf)).type).toBe('ForOfStatement');
    expect(node(value.ast(idFor)).type).toBe('ForStatement');
  });
});

describe('JsBatch — single invocation and memoization (§4.3, crit. #6)', () => {
  it('invokes parseSync exactly once for many fragments, and memoizes parse()', () => {
    const source = 'a + b ||| const x = 1; ||| c === d';
    const batch = new JsBatch(source);
    batch.add('expression', at(source, 'a + b'));
    batch.add('block-statements', at(source, 'const x = 1;'));
    batch.add('expression', at(source, 'c === d'));

    const first = batch.parse();
    expect(parseSync).toHaveBeenCalledTimes(1);

    const second = batch.parse();
    expect(parseSync).toHaveBeenCalledTimes(1); // memoized: no re-invocation
    expect(second).toBe(first);
  });

  it('zero fragments → empty result, no diagnostics (LSP invariant §5)', () => {
    const batch = new JsBatch('');
    const { value, diagnostics } = batch.parse();
    expect(diagnostics).toEqual([]);
    // Still a usable result surface.
    expect(typeof value.mapOffset).toBe('function');
  });
});

describe('JsBatch — diagnostics and mapping (§4.4, §4.5)', () => {
  it('syntax error → FUD0170 with a span inside the fragment source (crit. #7)', () => {
    const source = 'value = @(a +) done';
    const sp = at(source, 'a +');
    const batch = new JsBatch(source);
    batch.add('expression', sp);

    const { diagnostics } = batch.parse();
    expect(diagnostics).toHaveLength(1);
    const diag = diagnostics[0]!;
    expect(diag.code).toBe('FUD0170');
    expect(diag.severity).toBe('error');
    // Mapped to the ORIGINAL source, anchored within the fragment (not the buffer).
    expect(diag.span.start).toBeGreaterThanOrEqual(sp.start);
    expect(diag.span.end).toBeLessThanOrEqual(sp.end);
  });

  it('linear mapping inside a fragment: mapOffset(B) === S + (B − bufStart) (crit. #8)', () => {
    const source = 'lead <p>@(alpha + beta)</p> tail';
    const sp = at(source, 'alpha + beta');
    const batch = new JsBatch(source);
    const id = batch.add('expression', sp);

    const { value } = batch.parse();
    const ast = node(value.ast(id));
    // For an expression, the inner node begins exactly at the fragment text start:
    // mapOffset(ast.start) === srcStart, and every interior offset shifts linearly.
    expect(value.mapOffset(ast.start)).toBe(sp.start);
    expect(value.mapOffset(ast.start + 3)).toBe(sp.start + 3);
    expect(value.mapOffset(ast.end)).toBe(sp.end);
  });

  it('clamps wrapper-zone buffer offsets into the fragment source span', () => {
    // Single expression fragment: buffer is `( alpha + beta );`. Offset 0 lands in
    // the `(` prefix → clamps to srcStart; a far offset lands past the `);` suffix
    // → clamps to srcEnd. Both anchor the location inside the fragment.
    const source = 'alpha + beta';
    const sp = span(0, source.length);
    const batch = new JsBatch(source);
    batch.add('expression', sp);
    const { value } = batch.parse();

    expect(value.mapOffset(0)).toBe(sp.start);
    expect(value.mapOffset(9999)).toBe(sp.end);
  });

  it('degrades gracefully: unknown id → [], broken/empty fragments never throw', () => {
    const source = '';
    const batch = new JsBatch(source);
    const idExpr = batch.add('expression', span(0, 0)); // `();` → invalid, no node
    const idFor = batch.add('for-of-header', span(0, 0)); // `for () {}` → invalid

    const { value, diagnostics } = batch.parse();
    expect(diagnostics.length).toBeGreaterThan(0); // syntax errors reported, not thrown
    expect(value.ast(idExpr)).toEqual([]);
    expect(value.ast(idFor)).toEqual([]);
    expect(value.ast(999)).toEqual([]); // out-of-range id
  });

  it('mapOffset on an empty batch is identity (no fragments)', () => {
    const { value } = new JsBatch('').parse();
    expect(value.mapOffset(7)).toBe(7);
  });

  it('maps back through a non-zero fragment offset with multiple fragments', () => {
    const source = 'x ||| firstExpr ||| secondLongerExpr';
    const s1 = at(source, 'firstExpr');
    const s2 = at(source, 'secondLongerExpr');
    const batch = new JsBatch(source);
    const id1 = batch.add('expression', s1);
    const id2 = batch.add('expression', s2);

    const { value } = batch.parse();
    expect(value.mapSpan(node(value.ast(id1)).start, node(value.ast(id1)).end)).toEqual(s1);
    expect(value.mapSpan(node(value.ast(id2)).start, node(value.ast(id2)).end)).toEqual(s2);
  });
});
