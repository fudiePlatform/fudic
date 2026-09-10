/**
 * What a loop header declares (SDD-37 §5, `FUD0662`; SDD-30 §3.3).
 *
 * Two passes ask this and neither may import the other, so the answer has to be the same one
 * twice: the emit turns it into the parameters of a block, and the semantic pass into the list
 * of names a `delegate:` marker may write. The headers are real — each goes through `JsBatch`
 * with the very fragment kind the two passes register it as.
 */

import { describe, expect, it } from 'vitest';
import { JsBatch, loopHeaderNames, walkPattern, type OxcNode } from '../../src/oxc/index.js';
import { span } from '../../src/types/index.js';

/** Parse a loop header the way both passes do, and hand back its root node. */
function header(kind: 'for-of-header' | 'for-header', source: string): OxcNode {
  const batch = new JsBatch(source);
  const id = batch.add(kind, span(0, source.length));
  const result = batch.parse();
  expect(result.diagnostics).toEqual([]);
  return result.value.ast(id) as OxcNode;
}

describe('loopHeaderNames — the names a `@foreach`/`@for` header offers', () => {
  it('reads the binding of a `@foreach`', () => {
    expect(loopHeaderNames(header('for-of-header', 'const day of days'), 'foreach')).toEqual([
      'day',
    ]);
  });

  it('reads a destructured header member by member, in source order', () => {
    expect(loopHeaderNames(header('for-of-header', 'const { id, name } of rows'), 'foreach')).toEqual(
      ['id', 'name'],
    );
  });

  it('reads the init of a `@for`', () => {
    expect(loopHeaderNames(header('for-header', 'let i = 0; i < n; i++'), 'for')).toEqual(['i']);
  });

  it('a `@foreach` that only ASSIGNS declares nothing — `x of xs` is not `const x of xs`', () => {
    expect(loopHeaderNames(header('for-of-header', 'x of xs'), 'foreach')).toEqual([]);
  });

  it('a `@for` with no init declares nothing', () => {
    expect(loopHeaderNames(header('for-header', '; i < n; i++'), 'for')).toEqual([]);
  });

  it('a `@while` declares nothing, and is never even asked of its root', () => {
    expect(loopHeaderNames(header('for-of-header', 'const day of days'), 'while')).toEqual([]);
  });

  it('a header Oxc could not read declares nothing, and does not throw', () => {
    expect(loopHeaderNames(undefined, 'foreach')).toEqual([]);
    expect(loopHeaderNames({ type: 'ForOfStatement', start: 0, end: 0 }, 'foreach')).toEqual([]);
    expect(
      loopHeaderNames({ type: 'ForOfStatement', start: 0, end: 0, left: {} }, 'foreach'),
    ).toEqual([]);
    expect(
      loopHeaderNames(
        { type: 'ForOfStatement', start: 0, end: 0, left: { type: 'VariableDeclaration' } },
        'foreach',
      ),
    ).toEqual([]);
  });
});

describe('walkPattern — declarations and the expressions a pattern holds', () => {
  it('separates what a pattern DECLARES from what it merely READS', () => {
    const root = header('for-of-header', 'const { [k]: v, n = fallback } of rows');
    const declared: string[] = [];
    const read: string[] = [];
    const declaration = (root['left'] as OxcNode)['declarations'] as OxcNode[];
    walkPattern(declaration[0]!['id'], {
      name: (node) => declared.push(String(node['name'])),
      expression: (node) => read.push(String((node as OxcNode)['name'])),
    });
    expect(declared).toEqual(['v', 'n']);
    expect(read).toEqual(['k', 'fallback']);
  });
});
