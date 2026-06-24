/**
 * `Node` — root of the AST node hierarchy (SDD-01 §3.5). Physically materializes
 * the "universal spans" invariant: it is impossible to build a node without a
 * span. Concrete nodes are defined by SDD-05..10 extending this base.
 */

import type { Span } from './span.js';

/**
 * Root of the entire AST node hierarchy. Physically materializes the "universal
 * spans" invariant: it is IMPOSSIBLE to build a node without a span. Concrete
 * nodes (HTML elements, Razor expressions, @code blocks, ...) are defined by
 * SDD-05..10 extending this base; here only the contract exists.
 */
export interface Node {
  /**
   * Discriminant of the node union. Each later SDD adds its own literals.
   * Typed as string here; the concrete SDDs narrow it with their own types
   * that extend Node.
   */
  readonly type: string;

  /** Location of the whole node in the source. Required, no exceptions. */
  readonly span: Span;
}

/**
 * Node identity for hydration, inherited as an IDEA from the compiler-master
 * prototype (2019): __key / __instanceParentKey. Here we reserve the PLACE in
 * the type, optional, for the emit phase (SDD-14+) to fill in; the parser does
 * not assign it. Keeping it out of the base Node avoids polluting the parsing
 * AST with runtime concepts.
 */
export interface HydratableNode extends Node {
  readonly key?: string;
  readonly instanceParentKey?: string;
}
