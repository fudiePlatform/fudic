/**
 * A `SemanticInput` with EVERY piece of the view's JS in the batch, the way the editor and the
 * build register it (`@fudic/typecheck` `batchDocumentJs`): interpolations, attribute values,
 * `@{ }`, `@render` arguments, control headers and keys, snippet parameters and `@code`.
 *
 * The SDD-51 rules read the AST of all of them, so a test of those rules needs all of them —
 * the analyze test's `buildInput` registers interpolations only.
 */

import { parseDocument } from '../../src/html/index.js';
import { keyExpression } from '../../src/control/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId, type JsFragmentKind } from '../../src/oxc/index.js';
import type { Diagnostic, Node, Span } from '../../src/types/index.js';
import { analyze, documentRoots, walk, type SemanticInput } from '../../src/semantic/index.js';

export function viewInput(source: string): SemanticInput {
  const html = parseDocument(source, { atConstructs }).value;
  const document = structureDocument(source, html).value;
  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  const add = (node: Node, at: Span, kind: JsFragmentKind = 'expression'): void => {
    if (at.end > at.start) ids.set(node, batch.add(kind, at));
  };
  walk(documentRoots(document), {
    interpolation: (expr) => add(expr, expr.expr),
    binding: (expr) => add(expr, expr.expr),
    inlineCode: (node) => add(node, node.group.inner, 'block-statements'),
    render(node) {
      for (const arg of node.args) add(arg, arg.value);
    },
    control(node) {
      if (node.type === 'if') {
        for (const branch of node.branches) add(branch, branch.header.inner);
        return;
      }
      if (node.type === 'switch') {
        add(node, node.header.inner);
        for (const branch of node.cases) if (branch.test !== undefined) add(branch, branch.test);
        return;
      }
      const key = keyExpression(node);
      if (key !== undefined && node.key !== undefined) add(node.key, key);
      if (node.type === 'while') add(node, node.header.inner);
      else add(node, node.header.inner, node.type === 'foreach' ? 'for-of-header' : 'for-header');
    },
  });
  for (const decl of document.snippets) add(decl, decl.signature, 'params');
  for (const part of document.code?.parts ?? []) add(part, part.js, 'module-statements');
  return {
    source,
    document,
    js: batch.parse().value,
    fragmentId: (node) => ids.get(node),
    components: { has: (tag) => tag.includes('-') },
  };
}

/** The diagnostics of the semantic pass over `source`, every fragment registered. */
export function viewDiagnostics(source: string): readonly Diagnostic[] {
  return analyze(viewInput(source)).diagnostics;
}
