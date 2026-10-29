/**
 * `raw-only-child` (decision 18): an `@raw(…)` is the only content of an element.
 *
 * Its markup has a number of nodes nobody knows until it runs, and hydration walks a level by
 * counting elements. Owning one element whole is what keeps that count intact: the walk adopts
 * the element and never enters it, and an update rewrites its content and nothing else.
 *
 * The rule is `rawChild`, the very function both emit branches ask: an `@raw` it does not
 * return for its element is one they paint nothing for, so it is `FUD0990` — beside other
 * content, or with no element around it at all (a shadow root, the body of a construct).
 */

import { FUD0990 } from '@fudic/diagnostics';
import type { ElementNode, HtmlContent } from '../../html/index.js';
import type { AwaitNode, IfNode, SwitchNode, ForeachNode, ForNode, WhileNode } from '../../control/index.js';
import type { SectionNode } from '../../layout/index.js';
import type { SnippetDeclNode } from '../../snippet/index.js';
import { rawChild } from '../../emit/constructs.js';
import type { Analyzer } from '../model.js';
import { documentRoots } from '../walk.js';

/** The child lists a node holds, each with the element that owns it (`null` for a construct). */
function lists(node: HtmlContent): readonly (readonly [readonly HtmlContent[], ElementNode | null])[] {
  switch (node.type) {
    case 'element':
      return [[node.children, node]];
    case 'if': {
      const n = node as unknown as IfNode;
      const bodies = n.branches.map((b) => b.body);
      return [...bodies, ...(n.elseBody === undefined ? [] : [n.elseBody])].map((b) => [b, null] as const);
    }
    case 'switch':
      return (node as unknown as SwitchNode).cases.map((c) => [c.body, null] as const);
    case 'foreach':
    case 'for':
    case 'while':
      return [[(node as unknown as ForeachNode | ForNode | WhileNode).body, null]];
    case 'await': {
      const n = node as unknown as AwaitNode;
      return [[n.body, null], ...(n.catch === undefined ? [] : [[n.catch.body, null] as const])];
    }
    case 'section':
      return [[(node as unknown as SectionNode).children, null]];
    case 'snippet':
      return [[(node as unknown as SnippetDeclNode).children, null]];
    default:
      return [];
  }
}

export const rawOnlyChild: Analyzer = {
  name: 'raw-only-child',
  run(input, report) {
    const check = (list: readonly HtmlContent[], owner: ElementNode | null): void => {
      const owned = owner === null ? null : rawChild(owner);
      for (const node of list) {
        if (node.type === 'raw-expression' && node !== owned) report(FUD0990({ span: node.span }));
        for (const [children, childOwner] of lists(node)) check(children, childOwner);
      }
    };
    check(documentRoots(input.document), null);
  },
};
