/**
 * `primitive-interpolation` (decision 19): interpolation renders scalar primitives; an array
 * or object literal is an error. Without type-checking, SDD-12 only catches the EVIDENT case —
 * a literal `@([1, 2, 3])` / `@({ a: 1 })` — where the fragment's AST root is an array/object
 * literal. A non-literal (`@items`, typed `User[]`) is deferred to the type layer / runtime (§8.1).
 */

import { errorDiag } from '../../types/index.js';
import type { OxcNode } from '../../oxc/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

const FUD_NON_PRIMITIVE_INTERPOLATION = 'FUD0195';

export const primitiveInterpolation: Analyzer = {
  name: 'primitive-interpolation',
  run(input, report) {
    walk(documentRoots(input.document), {
      interpolation(expr) {
        const id = input.fragmentId(expr);
        if (id === undefined) return;

        const root = input.js.ast(id);
        if (Array.isArray(root)) return; // an expression fragment is a single node
        const node = unwrapParens(root as OxcNode);
        if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression') {
          report(
            errorDiag(
              FUD_NON_PRIMITIVE_INTERPOLATION,
              'interpolation of an array/object literal is not allowed; only scalar primitives',
              expr.span,
            ),
          );
        }
      },
    });
  },
};

/** Peel any `( … )` layers (e.g. the parens an object literal needs) to reach the real node. */
function unwrapParens(node: OxcNode): OxcNode {
  let current = node;
  while (current.type === 'ParenthesizedExpression') {
    const inner = current['expression'] as OxcNode | undefined;
    if (inner === undefined) break;
    current = inner;
  }
  return current;
}
