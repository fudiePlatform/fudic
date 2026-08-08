/**
 * The one anchor the DOM is given (SDD-30 §3.4).
 *
 * A block needs no marker to know where to insert: the anchor is the next node of its
 * level, which the walk already names. There is exactly one shape that argument does not
 * cover — two INTERPOLATED runs with nothing between them but constructs:
 *
 * ```razor
 * @a @if (x) { <b>…</b> } @b
 * ```
 *
 * With the block rendering nothing, those two runs come back from HTML as a SINGLE text
 * node — text has no boundary in markup — and no traversal tells one from the other. The
 * adopt path would land both variables on the same node, and the first update would write
 * one value over the other. So an empty comment goes in, and it is the only one that ever
 * does.
 *
 * **Why this is a module and not a method.** The comment has to be in the HTML the SERVER
 * paints and in the tree the CLIENT builds, decided identically: a marker on one side only
 * is worse than no marker at all, because then the two trees differ by a node and hydration
 * adopts a tree it does not recognise. The rule is therefore stated once, over the items
 * both branches already walk, and neither branch gets to have an opinion about it.
 */

import type { HtmlContent } from '../html/index.js';
import type { EmitItem } from './runs.js';

/** The closed set of control discriminants, as they appear among HTML children. */
const CONTROL_TYPES: ReadonlySet<string> = new Set(['if', 'switch', 'for', 'foreach', 'while']);

export const isControlNode = (node: HtmlContent): boolean => CONTROL_TYPES.has(node.type);

/** Whether item `i` of a level is a control construct. Past the end it is not one. */
function isConstructAt(items: readonly EmitItem[], i: number): boolean {
  const item = items[i];
  return item !== undefined && item.kind === 'node' && isControlNode(item.node);
}

/** Whether an item is one the walk gives a variable to — which only elements always are. */
function isElementAt(items: readonly EmitItem[], i: number): boolean {
  const item = items[i];
  return item !== undefined && item.kind === 'node' && item.node.type === 'element';
}

/** Where a level needs its comment, if it needs one at all. */
export interface MarkerSite {
  /** Index of the run in FRONT — the one that loses its anchor to the constructs. */
  readonly run: number;
  /** Index the comment is emitted at: just before the constructs. */
  readonly at: number;
}

/**
 * The site of the one marker a level may need, or `undefined` — which is nearly always.
 *
 * The run in front has to be reachable FORWARD, from the start of the level or from the
 * element before it, because backwards it would walk into whatever the constructs painted.
 * With neither available the shape stays unresolved and NO marker is written: a comment
 * placed where the adopt path cannot reach the run anyway would be a node in the DOM
 * buying nothing.
 */
export function markerSite(items: readonly EmitItem[]): MarkerSite | undefined {
  for (let i = 0; i < items.length - 1; i += 1) {
    const first = items[i]!;
    if (first.kind !== 'run' || !first.interpolated) continue;
    let j = i + 1;
    while (isConstructAt(items, j)) j += 1;
    if (j === i + 1 || j >= items.length) continue; // nothing between them, or nothing after
    const second = items[j]!;
    if (second.kind !== 'run' || !second.interpolated) continue;
    if (i > 0 && !isElementAt(items, i - 1)) continue;
    return { run: i, at: i + 1 };
  }
  return undefined;
}
