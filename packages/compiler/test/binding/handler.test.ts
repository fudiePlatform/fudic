/**
 * `handlerShape` (BUG-23 task 6): the classification of decisions 96–98, extracted from
 * `emit/events.ts` so the projection can reach it without importing the emit.
 *
 * The ASTs come from the real batch rather than from hand-written literals: the whole point
 * of the rule is that it decides on the node Oxc returns, and `@(x ? a : b)()` and `@(f)` do
 * not separate by text.
 */

import { describe, expect, it } from 'vitest';
import { handlerShape, unwrapParens } from '../../src/binding/index.js';
import { JsBatch, type OxcNode } from '../../src/oxc/index.js';
import { span } from '../../src/types/index.js';

/** The root node Oxc returns for one expression, as the emit reads it. */
function root(source: string): OxcNode | undefined {
  const batch = new JsBatch(source);
  const id = batch.add('expression', span(0, source.length));
  const ast = batch.parse().value.ast(id);
  return Array.isArray(ast) ? undefined : (ast as OxcNode);
}

const shapeOf = (source: string): string => handlerShape(root(source));

describe('handlerShape — the four shapes', () => {
  it('a bare name is a reference', () => {
    expect(shapeOf('toggle')).toBe('reference');
  });

  it('a call is a deferred invocation', () => {
    expect(shapeOf('del(item.id)')).toBe('call');
    expect(shapeOf('del($event)')).toBe('call');
  });

  it('an arrow and a function expression are both lambdas', () => {
    expect(shapeOf('(e) => f(e)')).toBe('lambda');
    expect(shapeOf('function (e) { f(e); }')).toBe('lambda');
  });

  it('anything else is unsuitable — that is FUD0291', () => {
    expect(shapeOf('1')).toBe('unsuitable');
    expect(shapeOf('a + b')).toBe('unsuitable');
    expect(shapeOf('{ a: 1 }')).toBe('unsuitable');
  });

  it('a value it cannot read is unsuitable, never a crash', () => {
    expect(handlerShape(undefined)).toBe('unsuitable');
  });
});

describe('handlerShape — the parentheses the author wrote', () => {
  it('sees through them, so a wrapped lambda is still a lambda', () => {
    expect(shapeOf('((e) => f(e))')).toBe('lambda');
    expect(shapeOf('((toggle))')).toBe('reference');
  });

  it('and `unwrapParens` is what the emit takes the call apart with', () => {
    const node = unwrapParens(root('(del(1))'));
    expect(node?.type).toBe('CallExpression');
  });

  it('leaves a node that has none untouched', () => {
    expect(unwrapParens(undefined)).toBeUndefined();
    expect(unwrapParens(root('toggle'))?.type).toBe('Identifier');
  });
});
