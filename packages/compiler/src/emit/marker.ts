/**
 * The comments the DOM is given (SDD-30 §3.4, SDD-85).
 *
 * HTML keeps no boundary between two texts: whatever two text nodes the server writes side by
 * side, the parser hands back as ONE. A block needs no marker to know where to insert — the
 * anchor is the next node of its level — but the browser cannot tell two texts apart once
 * they are one node, and then it adopts the wrong one: a value written into one run wipes the
 * other, a block that opens goes in front of the whole sentence, a block that closes takes
 * the text behind it away. Texts meet in three ways, and each one gets its comment:
 *
 * ```razor
 * <p>Hola @nombre @if (hay) { <b>…</b> } adiós</p>     ← two runs, only blocks between them
 * <p>Hola @if (hay) { tienes @n mensajes }</p>        ← a run, and a block that opens with text
 * @foreach (const n of lista) { n.º @n }              ← a block that ends with text
 * ```
 *
 * A comment after the run in front in the first two shapes, and one at the end of the block's
 * body in the third. With them no text of the server's HTML touches another text, and the
 * client finds every one of them as the node in front of the node after it.
 *
 * **Why this is a module and not a method.** The comment has to be in the HTML the SERVER
 * paints and in the tree the CLIENT builds, decided identically: a marker on one side only
 * is worse than no marker at all, because then the two trees differ by a node and hydration
 * adopts a tree it does not recognise. The rule is therefore stated once, over the items
 * both branches already walk, and neither branch gets to have an opinion about it.
 */

import type { HtmlContent } from '../html/index.js';
import type { EmitItem } from './runs.js';
import { blocksOf } from './constructs.js';

/**
 * The closed set of construct discriminants, as they appear among HTML children: the five
 * control constructs, and `@await` (SDD-70). An `@await` paints one of its blocks or nothing,
 * exactly like an `@if`, so the two trees have to treat it as one in every rule here.
 */
const CONSTRUCT_TYPES: ReadonlySet<string> = new Set(['if', 'switch', 'for', 'foreach', 'while', 'await']);

export const isConstructNode = (node: HtmlContent): boolean => CONSTRUCT_TYPES.has(node.type);

/** Whether item `i` of a level is a control construct. Past the end it is not one. */
export function isConstructAt(items: readonly EmitItem[], i: number): boolean {
  const item = items[i];
  return item !== undefined && item.kind === 'node' && isConstructNode(item.node);
}

/**
 * Whether item `i` stands between two runs without being a node of the HTML on its own: a
 * construct, which may paint nothing, or an `@{ }`, which never does.
 */
function isGapAt(items: readonly EmitItem[], i: number): boolean {
  const item = items[i];
  return item !== undefined && item.kind === 'node' && (isConstructNode(item.node) || item.node.type === 'inline-code');
}

/** What paints nothing at the edge of a body: the author's comments and an `@{ }`. */
const SILENT: ReadonlySet<string> = new Set(['comment', 'razor-comment', 'inline-code']);

/**
 * Whether a construct may paint text as its very first node: one of its bodies starts with
 * anything but an element. Read off the source, before the whitespace a context drops: a body
 * that starts with a blank line counts, which costs a comment and never a wrong tree.
 */
function opensWithText(node: HtmlContent): boolean {
  return blocksOf(node).some((branch) => {
    const first = branch.body.find((child) => !SILENT.has(child.type));
    return first !== undefined && first.type !== 'element';
  });
}

/** Whether item `i` is a run: a text of the HTML, or a hole the client creates one for. */
function isTextAt(items: readonly EmitItem[], i: number): boolean {
  return items[i]?.kind === 'run';
}

/** Where a level needs a comment. */
export interface MarkerSite {
  /** Index of the run in FRONT — the one the comment closes. */
  readonly run: number;
  /** Index the comment is emitted at: just after that run. */
  readonly at: number;
}

/**
 * Every comment a level needs between its items, in source order: one after each run that is
 * followed by constructs or `@{ }`s, when behind them comes another run or one of those
 * constructs may open with text. Usually none.
 */
export function markerSites(items: readonly EmitItem[]): readonly MarkerSite[] {
  const sites: MarkerSite[] = [];
  for (let i = 0; i < items.length - 1; i += 1) {
    if (!isTextAt(items, i)) continue;
    let j = i + 1;
    let opens = false;
    for (; isGapAt(items, j); j += 1) opens ||= opensWithText((items[j] as { readonly node: HtmlContent }).node);
    if (j === i + 1 || !(opens || isTextAt(items, j))) continue;
    sites.push({ run: i, at: i + 1 });
  }
  return sites;
}

/**
 * Whether a block's body ends with a comment: when a run is the last thing it may paint, with
 * nothing but constructs and `@{ }`s behind it.
 */
export function closesBody(items: readonly EmitItem[]): boolean {
  let i = items.length - 1;
  while (isGapAt(items, i)) i -= 1;
  return isTextAt(items, i);
}

/**
 * Whether text may come right after construct `i` of a level, so that a body of it that ends
 * with text has to close with a comment (`closesBody`): its next row when it is a loop that may
 * open with text, a construct behind it that may, the next run, or — at the end of the level —
 * whatever follows the level, which `follows` says.
 */
export function textMayFollow(items: readonly EmitItem[], i: number, follows: boolean): boolean {
  const own = (items[i] as { readonly node: HtmlContent }).node;
  if (LOOP_TYPES.has(own.type) && opensWithText(own)) return true;
  let j = i + 1;
  for (; isGapAt(items, j); j += 1) {
    if (opensWithText((items[j] as { readonly node: HtmlContent }).node)) return true;
  }
  if (j >= items.length) return follows;
  const next = items[j]!;
  return next.kind === 'run' || next.node.type !== 'element';
}

/** The constructs that paint their body once per row. */
const LOOP_TYPES: ReadonlySet<string> = new Set(['for', 'foreach', 'while']);
