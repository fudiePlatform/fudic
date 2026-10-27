/**
 * Where the portable view lies in a `.fud` (SDD-61 §4.2): what the typed pass checks with the
 * checker over the projection, told by the one walk that already knows it.
 *
 * The typed pass could tell a handler from a value by the shape of the projection, but then two
 * modules would answer «is this browser code?» and could answer it differently. The compiler
 * walked the view and the server cut; it hands over their Oxc nodes, each with the place it sits
 * in, and how a node's offsets reach the `.fud`.
 */

import type { OxcNode } from '../oxc/index.js';
import type { Span } from '../types/index.js';
import type { SemanticInput } from './model.js';
import { serverCut } from './server-cut.js';
import { isCallback, portableView } from './view-portable.js';
import type { ViewFragment, ViewScope } from './view-scope.js';

/**
 * What the server asks of a root of the view: a value, a condition (`@if`, `@while`), the subject
 * of a `@switch`, a `key`, the statements of an `@{ }`, or the header of a `@for` / `@foreach`.
 */
export type PortablePlace = 'value' | 'condition' | 'subject' | 'key' | 'statements' | 'for' | 'for-of';

/** One root of the view: an expression, a `@for`/`@foreach` statement, or an `@{ }`'s list. */
export interface PortableRoot {
  readonly node: OxcNode | readonly OxcNode[];
  readonly place: PortablePlace;
}

export interface PortableRegions {
  /** The JS of the view the server evaluates while painting: never a handler nor a callback. */
  readonly view: readonly PortableRoot[];
  /** The expressions of the `@code`'s server cut that the white list checks. */
  readonly cut: readonly OxcNode[];
  /** The `const`/`let` declarators of the `@code` in the server cut. */
  readonly declarations: readonly OxcNode[];
  /** The parameters of every `@snippet`: their types have to port too (§3.10). */
  readonly parameters: readonly OxcNode[];
  /** Where an Oxc node of this file is written in the `.fud`. */
  span(node: OxcNode): Span;
}

/** The regions of `input` the portable rules apply to. Never throws. */
export function portableRegions(input: SemanticInput): PortableRegions {
  const { scope } = portableView(input);
  const cut = serverCut(input);
  return {
    view: scope.fragments.flatMap((fragment) => rootOf(scope, fragment)),
    cut: cut.expressions,
    declarations: cut.declarations,
    parameters: input.document.snippets.flatMap((snippet) => {
      const id = input.fragmentId(snippet);
      const root = id === undefined ? undefined : input.js.ast(id);
      // A snippet is registered as one `function`, whose parameters Oxc read.
      return root === undefined || Array.isArray(root) ? [] : ((root as OxcNode)['params'] as readonly OxcNode[]);
    }),
    span: (node) => input.js.mapSpan(node.start, node.end),
  };
}

/** A fragment as a root of the view; none for a handler, a callback or a `case` label. */
function rootOf(view: ViewScope, fragment: ViewFragment): readonly PortableRoot[] {
  const node = fragment.root;
  switch (fragment.shape) {
    case 'handler':
      return [];
    case 'prop':
      return isCallback(node as OxcNode, view, fragment.scope) ? [] : [{ node, place: 'value' }];
    case 'statements':
      return [{ node, place: 'statements' }];
    case 'while':
      return [{ node, place: 'condition' }];
    case 'key':
      return [{ node, place: 'key' }];
    case 'for-header':
      return [{ node, place: 'for' }];
    case 'for-of-header':
      return [{ node, place: 'for-of' }];
    default:
      return [{ node, place: placeOf(fragment) }];
  }
}

/** Where an expression fragment sits: the arm of an `@if`, a `@switch`, or a plain value. */
function placeOf(fragment: ViewFragment): PortablePlace {
  switch (fragment.owner.type) {
    case 'conditional-branch':
      return 'condition';
    case 'switch':
      return 'subject';
    default:
      return 'value';
  }
}
