/**
 * What SHAPE the value of an event binding has (grammar decisions 96–98).
 *
 * The rule used to live inside `emit/events.ts`, which made it unreachable for anyone who
 * is not the emit — and the editor is exactly that. The consequence was BUG-23 §2.4: the
 * projection copied `onClick($event)` verbatim into `$on('click', …)` and reported two
 * TypeScript errors on a line the compiler emits perfectly. One definition, two readers.
 *
 * The distinction is made on the ROOT node Oxc returns, never on the text: `@(x ? a : b)()`
 * and `@(f)` do not separate with a regular expression.
 */

import type { OxcNode } from '../oxc/index.js';

/**
 * The four shapes a handler value can have.
 *
 *  - `reference` — `@toggle`: what it evaluates to IS the listener.
 *  - `call`      — `@del(item.id)`: an invocation deferred to DISPATCH, wrapped in an
 *                  arrow whose parameter is spelled `$event`.
 *  - `lambda`    — `@(e => …)` / `@(function (e) {…})`: the listener, written inline.
 *  - `unsuitable`— anything else, which is `FUD0291`.
 */
export type HandlerShape = 'reference' | 'call' | 'lambda' | 'unsuitable';

/**
 * The expression past any parentheses the AUTHOR wrote.
 *
 * The batch parses with `preserveParens`, so `@((e) => f(e))` arrives as a
 * `ParenthesizedExpression` around the arrow. Those parens are the author's own — the ones
 * of the `@( … )` atom are not in the span — and refusing a handler over them would be
 * `FUD0291` on perfectly good JS.
 */
export function unwrapParens(node: OxcNode | undefined): OxcNode | undefined {
  let current = node;
  while (current !== undefined && current.type === 'ParenthesizedExpression') {
    current = current['expression'] as OxcNode | undefined;
  }
  return current;
}

/** The three roots that ARE the listener: what they evaluate to is subscribed as it is. */
const LAMBDA: ReadonlySet<string> = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/**
 * The shape of a handler value from the root node of its expression. A missing root — the
 * fragment was never registered, or it failed to parse — is `unsuitable`: the emit refuses
 * what it cannot read, and so does the projection.
 */
export function handlerShape(root: OxcNode | undefined): HandlerShape {
  const node = unwrapParens(root);
  if (node === undefined) return 'unsuitable';
  if (node.type === 'Identifier') return 'reference';
  if (node.type === 'CallExpression') return 'call';
  return LAMBDA.has(node.type) ? 'lambda' : 'unsuitable';
}
