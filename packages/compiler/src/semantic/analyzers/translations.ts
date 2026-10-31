/**
 * `translations` (SDD-58 §3.7): the error of the CODE about translating.
 *
 * - `FUD1020`: a `t()` with no literal to extract, or without the object of its holes. The
 *   same check the extraction runs, through the same collector.
 *
 * `FUD1021` lived here too, for an app without `locales`; every app has one now (SDD-71).
 * Errors about catalogs are `fudic translate`'s and never come from here.
 */

import { i18nImports } from '../../i18n/ast.js';
import { collectCalls } from '../../i18n/messages.js';
import { keyExpression } from '../../control/index.js';
import type { OxcNode } from '../../oxc/index.js';
import type { Node } from '../../types/index.js';
import type { Analyzer, SemanticInput } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const translations: Analyzer = {
  name: 'translations',
  run(input, report) {
    const { view, code } = fragments(input);
    // A `@code` part is registered as `module-statements`: its AST is always the list.
    const imports = i18nImports(code.flat() as readonly OxcNode[]);
    if (imports.size > 0) {
      collectCalls({ context: '', scripts: [...view, ...code], imports, mapSpan: input.js.mapSpan }).diagnostics.forEach(
        report,
      );
    }
  },
};

/** The ASTs of the view's fragments and of `@code`, apart: a pipe exists only in the first. */
function fragments(input: SemanticInput): {
  readonly view: readonly (OxcNode | readonly OxcNode[])[];
  readonly code: readonly (OxcNode | readonly OxcNode[])[];
} {
  const owners: Node[] = [];
  walk(documentRoots(input.document), {
    interpolation: (expr) => owners.push(expr),
    binding: (expr) => owners.push(expr),
    inlineCode: (node) => owners.push(node),
    render: (node) => owners.push(...node.args),
    control: (node) => {
      if (node.type === 'if') owners.push(...node.branches);
      else if (node.type === 'switch') owners.push(node, ...node.cases);
      else owners.push(node);
      if (keyExpression(node) !== undefined) owners.push(node.key!);
    },
  });
  const astOf = (owner: Node): (OxcNode | readonly OxcNode[])[] => {
    const id = input.fragmentId(owner);
    return id === undefined ? [] : [input.js.ast(id)];
  };
  return {
    view: owners.flatMap(astOf),
    code: (input.document.code?.parts ?? []).flatMap(astOf),
  };
}
