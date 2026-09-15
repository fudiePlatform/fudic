/**
 * Typed access over the untyped Oxc node, quarantined in one module.
 *
 * Oxc hands back an estree-shaped node whose children are reached by property name. The
 * compiler's emit keeps that stringly-typed access behind three helpers and never indexes a
 * node anywhere else; this is the same fence on the projection's side of the fence, so the two
 * readers of `props<T>()` and of `layout(ctx, data)` share one set instead of a copy each.
 */

import type { OxcNode } from '@fudic/compiler';

/** A child node under `key`, when it is a node at all. */
export function child(parent: OxcNode, key: string): OxcNode | undefined {
  const value = parent[key];
  return isNode(value) ? value : undefined;
}

/** The node array under `key`, skipping holes (`[, x]` yields a null element). */
export function nodeList(parent: OxcNode, key: string): readonly OxcNode[] {
  const value = parent[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

export function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}
