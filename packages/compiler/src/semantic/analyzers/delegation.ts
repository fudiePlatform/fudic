/**
 * `delegation` (SDD-37 §5): the eight diagnostics of `delegate:`, reported to the editor.
 *
 * The rule itself is `planDelegation`'s, which the emit applies too — one pairing, two
 * consumers, and this analyzer is only the place it is REPORTED from. That is BUG-23 §2.4's
 * lesson applied before it could bite: a rule that lives inside the emit is a rule the editor
 * stays silent about over the very line being typed.
 */

import { planDelegation, type DelegationJs } from '../delegation.js';
import type { OxcNode } from '../../oxc/index.js';
import type { Node } from '../../types/index.js';
import type { Analyzer, SemanticInput } from '../model.js';
import { documentRoots } from '../walk.js';

/**
 * The batch, reached the way the semantic pass reaches it: by NODE.
 *
 * A fragment that failed to parse has `FUD0170` already and one nobody registered cannot be
 * asked about — silence is the honest answer in both cases, not a complaint about a value this
 * pass could not read.
 */
function jsOf(input: SemanticInput): DelegationJs {
  const astOf = (node: Node): OxcNode | undefined => {
    const id = input.fragmentId(node);
    if (id === undefined) return undefined;
    const root = input.js.ast(id);
    return Array.isArray(root) ? undefined : (root as OxcNode);
  };
  return {
    headerAst: astOf,
    valueAst: astOf,
    spanOf: (node) => input.js.mapSpan(node.start, node.end),
  };
}

export const delegation: Analyzer = {
  name: 'delegation',
  run(input, report) {
    const plan = planDelegation(input.source, documentRoots(input.document), jsOf(input));
    for (const diagnostic of plan.diagnostics) report(diagnostic);
  },
};
