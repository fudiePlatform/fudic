/**
 * What a binding pattern DECLARES, over the Oxc AST.
 *
 * It lives here, beside the batch, and not in the emit, because two passes ask it and neither
 * may import the other: the emit needs the parameters of a block (SDD-30 §3.3) and the
 * semantic pass needs the names a loop header offers a `delegate:` marker (SDD-37 §5,
 * `FUD0662`). A rule both of them read cannot live inside either of them — the same reading
 * that put `handlerShape` in `binding/`.
 *
 * The traversal is handed a visitor rather than returning names, because the emit does a
 * second thing with the same walk: it BINDS each name into its scope stack and descends into
 * the expressions a pattern can hold — a computed key, a default value — which are references
 * and not declarations. Collecting names twice, once per caller, is how the two answers drift.
 */

import type { OxcNode } from './batch.js';

/** What a pattern walk reports: the names it declares, and the expressions it holds. */
export interface PatternVisitor {
  /** An `Identifier` in binding position: a name this pattern declares. */
  name(node: OxcNode): void;
  /**
   * An expression a pattern carries, which REFERS instead of declaring: the key of a computed
   * property, the right-hand side of a default.
   */
  expression(node: unknown): void;
}

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

function field(node: OxcNode, key: string): unknown {
  return node[key];
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/**
 * Walk a binding pattern, reporting what it declares and what it merely reads.
 *
 * Anything that is not a pattern node — `undefined` from a header Oxc could not parse, a hole
 * in `[a, , b]` — declares nothing, which is the same answer as an empty pattern.
 */
export function walkPattern(pattern: unknown, visitor: PatternVisitor): void {
  if (!isNode(pattern)) return;
  switch (pattern.type) {
    case 'Identifier':
      visitor.name(pattern);
      return;
    case 'ObjectPattern':
      for (const property of asArray(field(pattern, 'properties'))) {
        if (isNode(property) && property.type === 'Property') {
          if (field(property, 'computed') === true) visitor.expression(field(property, 'key'));
          walkPattern(field(property, 'value'), visitor);
          continue;
        }
        walkPattern(property, visitor);
      }
      return;
    case 'ArrayPattern':
      for (const element of asArray(field(pattern, 'elements'))) walkPattern(element, visitor);
      return;
    case 'AssignmentPattern':
      walkPattern(field(pattern, 'left'), visitor);
      visitor.expression(field(pattern, 'right'));
      return;
    case 'RestElement':
      walkPattern(field(pattern, 'argument'), visitor);
      return;
    default:
      // A TS-annotated parameter wraps the binding; everything else declares nothing.
      walkPattern(field(pattern, 'expression'), visitor);
  }
}

/**
 * The names a binding pattern declares, in the order the pattern writes them.
 *
 * That order is the parameter order of a block (SDD-30 §3.3): `{ id, name }` yields `id` then
 * `name` and never the other way round, because a signature that reshuffles between two
 * compilations of the same file is not a signature.
 */
export function patternNames(pattern: unknown): readonly string[] {
  const out: string[] = [];
  walkPattern(pattern, {
    name: (node) => out.push(String(node['name'])),
    expression: () => undefined,
  });
  return out;
}

/**
 * The names the header of a `@foreach`/`@for` declares — the whole of what a `delegate:` may
 * name (decision 117) and the parameter order of the loop's block (SDD-30 §3.3).
 *
 * `const x of xs` vs `x of xs`: only the first DECLARES. The second assigns to a binding that
 * already exists somewhere else, so the loop names nothing of its own — and a loop that names
 * nothing has no key that can tell its rows apart (`FUD0543`).
 *
 * A header Oxc could not parse arrives as `undefined`, and a `@while` has no declaration at
 * all; both answer the empty list, which is the honest answer and not an error of this
 * function's making.
 */
export function loopHeaderNames(root: unknown, kind: 'foreach' | 'for' | 'while'): readonly string[] {
  if (kind === 'while' || !isNode(root)) return [];
  const declaration = field(root, kind === 'foreach' ? 'left' : 'init');
  if (!isNode(declaration) || declaration.type !== 'VariableDeclaration') return [];
  const first = asArray(field(declaration, 'declarations'))[0];
  return isNode(first) ? patternNames(field(first, 'id')) : [];
}
