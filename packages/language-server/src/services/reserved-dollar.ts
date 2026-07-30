/**
 * The reserved `$` namespace (SDD-24 §4.4, §6.11).
 *
 * Every identifier the projection of SDD-23 introduces starts with `$` — `$tpl`, `$p0`, `$C0`,
 * `$Props` — so a user identifier with the same prefix would make scaffolding and user code
 * indistinguishable. The rule is therefore not style: it is what makes the projection safe.
 *
 * It is checked over Oxc `Identifier` nodes, never over text. Only the PREFIX is reserved:
 * `foo$` is a name that happens to end in `$`, and `obj.$bar` is a property of someone else's
 * object — neither is a declaration in this file's scope. That distinction is exactly what a
 * regular expression cannot make, and it is why this runs on the AST the batch already built.
 */

import type { Diagnostic, OxcNode } from '@fudic/compiler';
import type { FragmentId, JsBatchResult } from '@fudic/compiler';
import { reservedDollar } from '../diagnostics.js';
import type { CachedDocument } from '../document-cache.js';

/**
 * Fields that name something instead of referring to it.
 *
 * `obj.$bar` and `{ $bar: 1 }` are the same case twice: the identifier is a member name in
 * someone else's namespace. When the parent is `computed`, the field holds a real expression
 * and is visited like any other.
 */
const NAMING_FIELDS = new Set(['property', 'key']);

/** Whether a node is an object we can walk. */
function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}

/**
 * The top-level statements of a region's fragment.
 *
 * A `module-statements` fragment always yields a statement list (SDD-11 §3.2); the single-node
 * half of the union belongs to fragment kinds this server never registers, so branching on it
 * would be dead code rather than defensiveness.
 */
function statementsOf(result: JsBatchResult, id: FragmentId): readonly OxcNode[] {
  return result.ast(id) as readonly OxcNode[];
}

/** Walk an Oxc subtree, reporting `$`-prefixed identifiers. */
function visit(node: OxcNode, report: (node: OxcNode) => void): void {
  if (node.type === 'Identifier' && String(node['name']).startsWith('$')) {
    report(node);
  }

  const computed = node['computed'] === true;
  for (const [field, value] of Object.entries(node)) {
    if (NAMING_FIELDS.has(field) && !computed) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) visit(item, report);
      }
      continue;
    }
    if (isNode(value)) visit(value, report);
  }
}

/**
 * `FUD0461` for every `$`-prefixed identifier in the `@server` and `@client` regions.
 *
 * The neutral zone is deliberately not covered: §4.4 names the two regions, and widening the
 * rule is a decision for the spec, not for the implementation.
 */
export function reservedDollarDiagnostics(document: CachedDocument): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const region of document.js.regions) {
    for (const statement of statementsOf(document.js.result, region.id)) {
      visit(statement, (node) => {
        const span = document.js.result.mapSpan(node.start, node.end);
        diagnostics.push(reservedDollar(String(node['name']), span));
      });
    }
  }
  return diagnostics;
}
