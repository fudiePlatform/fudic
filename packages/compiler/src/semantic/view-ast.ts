/**
 * Typed reads over the untyped Oxc AST, and the few facts about an expression the view's rules
 * share: whether it is always true and which names it reads.
 *
 * Shared by the two walks of the view — SDD-51's and the portable one of SDD-61 — so the second
 * does not copy the first's plumbing while both live.
 */

import type { OxcNode } from '../oxc/index.js';

export function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

export const field = (node: OxcNode, key: string): unknown => node[key];

export const child = (node: OxcNode, key: string): OxcNode | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};

/** A list field of the node, holes dropped: `[, a]` has an element that is no node. */
export const children = (node: OxcNode, key: string): readonly OxcNode[] =>
  (node[key] as readonly unknown[]).filter(isNode);

export const nameOf = (node: OxcNode): string => String(node['name']);

/**
 * The wrappers TypeScript erases and the parentheses `preserveParens` keeps: none of them
 * changes what the expression inside does, so a reading of its VALUE sees through them.
 */
const TRANSPARENT: ReadonlySet<string> = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);

export function unwrap(node: OxcNode): OxcNode {
  let current = node;
  for (let inner = child(current, 'expression'); TRANSPARENT.has(current.type) && inner; ) {
    current = inner;
    inner = child(current, 'expression');
  }
  return current;
}

/** A value that is always truthy: `true`, `1`, `'x'`, `{}`, `[]`. */
export function alwaysTrue(node: OxcNode): boolean {
  const value = unwrap(node);
  if (value.type === 'ObjectExpression' || value.type === 'ArrayExpression') return true;
  return value.type === 'Literal' && field(value, 'regex') == null && Boolean(field(value, 'value'));
}

/** The names an expression reads: identifiers, never a member's name or an object's key. */
export function readNames(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) readNames(item, out);
    return out;
  }
  if (!isNode(node)) return out;
  if (node.type === 'Identifier') {
    out.add(nameOf(node));
    return out;
  }
  for (const key of Object.keys(node)) {
    const named = (key === 'property' || key === 'key') && field(node, 'computed') !== true;
    if (!named) readNames(node[key], out);
  }
  return out;
}
