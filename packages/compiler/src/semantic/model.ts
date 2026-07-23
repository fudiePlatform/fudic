/**
 * Public contracts of the semantic pass (SDD-12 §3). Kept in their own module so the
 * analyzers and the `analyze()` runner both depend on the interfaces without importing
 * each other (no cycle through `analyze.ts`).
 */

import type { Node } from '../types/index.js';
import type { Diagnostic, ParseResult } from '../types/index.js';
import type { StructuredDocument } from '../document/index.js';
import type { JsBatchResult, FragmentId } from '../oxc/index.js';

/** Everything an analyzer needs. Assembled by the pipeline (fragment collection is SDD-11 §7). */
export interface SemanticInput {
  readonly source: string;
  readonly document: StructuredDocument;
  /** Batched JS AST (SDD-11). */
  readonly js: JsBatchResult;
  /**
   * The Oxc fragment a JS-bearing node was registered as. Keyed by the node that OWNS the
   * JS span: the `RazorExpression` for interpolations/headers, the region node
   * (`NeutralJs`/`ServerRegion`/`ClientRegion`) for `@code` parts. `undefined` when the node
   * was never registered or its fragment failed to parse (FUD0170 already covered it).
   */
  fragmentId(node: Node): FragmentId | undefined;
  /** Declared component tags (from `<link rel="component">`). Injected; see §7 for its origin. */
  readonly components: ComponentRegistry;
}

/** Resolves whether a custom tag is a declared component (decision 41). Cross-file; injected (DIP). */
export interface ComponentRegistry {
  has(tag: string): boolean;
}

/**
 * Resolved semantic facts the emit consumes. Empty in v1 by design: the facts §1 anticipates
 * (effective level, component catalog, bus map) are all deferred — the bus map is out of v1
 * (§8.4), the catalog enters via the injected `ComponentRegistry`, and no analyzer computes a
 * level yet. The shape exists so `analyze()` can grow facts without changing its signature.
 */
export interface SemanticModel {
  readonly _empty?: never;
}

/** One semantic rule. Reports diagnostics and may contribute to the model. */
export interface Analyzer {
  readonly name: string;
  run(input: SemanticInput, report: (d: Diagnostic) => void): void;
}

/** The result an analyzer runner returns. */
export type SemanticResult = ParseResult<SemanticModel>;
