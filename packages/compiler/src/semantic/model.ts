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

/**
 * What the child declares about one prop. Declared in `binding/crossing.ts` and re-exported
 * from here: a rule the emit and this pass both read cannot live inside either of them.
 */
import type { ComponentDeclaredProps } from '../binding/index.js';
export type { ComponentDeclaredProps } from '../binding/index.js';

/**
 * Resolves whether a custom tag is a declared component (decision 41). Cross-file; injected (DIP).
 *
 * The two contract questions are OPTIONAL, and `undefined` from either is a legitimate answer
 * meaning «I cannot know». The build serves them off the resolved graph, which holds the
 * child's own document; a host that cannot read the child — the language server, where
 * TypeScript already checks these two things over the projection — leaves them out, and the
 * rules that need them stay silent instead of guessing (BUG-23 §4.4).
 */
export interface ComponentRegistry {
  has(tag: string): boolean;
  /** What the tag declares as props, or `undefined` when it cannot be known. */
  propsOf?(tag: string): readonly ComponentDeclaredProps[] | undefined;
  /** The names the tag declares with `<slot name="…">`, or `undefined` when unknowable. */
  slotsOf?(tag: string): readonly string[] | undefined;
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

/**
 * What a rule about MARKUP alone needs: the tree and the registry, no JavaScript.
 *
 * It exists so the two contract rules of BUG-23 §4.4 have exactly one implementation with
 * two callers — the semantic pass, which passes a whole `SemanticInput`, and the build, which
 * has a resolved graph and no Oxc batch of the entry to hand over. A rule that both the
 * editor and the build apply cannot be written twice.
 */
export type MarkupInput = Pick<SemanticInput, 'document' | 'components'>;

/** What an analyzer is handed to report with. */
export type Report = (diagnostic: Diagnostic) => void;

/** One semantic rule. Reports diagnostics and may contribute to the model. */
export interface Analyzer {
  readonly name: string;
  run(input: SemanticInput, report: (d: Diagnostic) => void): void;
}

/** The result an analyzer runner returns. */
export type SemanticResult = ParseResult<SemanticModel>;
