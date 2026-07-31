/**
 * Content: a list of children read as items and the runs between them, printed.
 *
 * Everything that decides whether a line may break happens here, and it happens in exactly
 * one place: `gapDoc`. The printers below choose WHAT to print; only the gaps decide where
 * the printer is allowed to breathe.
 */

import { concat, fill, indent, type Doc } from '../doc/index.js';
import { gapDoc, sequenceOf, type Item } from '../space/index.js';
import type { HtmlContent } from '@fudic/compiler';
import type { PrintContext } from './context.js';
import { printNode } from './node.js';

/** One item: a word of text, or a node. */
function printItem(ctx: PrintContext, item: Item): Doc {
  return item.kind === 'word' ? item.text : printNode(ctx, item.node);
}

/**
 * The body of a container: items and gaps, alternating.
 *
 * The alternation IS `fill`'s shape — content, separator, content — so a run of inline
 * content packs to the margin and a list of blocks, whose gaps are all hard breaks,
 * degenerates to a plain sequence. One construct, both behaviours.
 */
export function printItems(
  ctx: PrintContext,
  nodes: readonly HtmlContent[],
  breakable: boolean,
): Doc {
  const sequence = sequenceOf(nodes);
  const parts: Doc[] = [];
  for (const [index, item] of sequence.items.entries()) {
    if (index > 0) parts.push(gapDoc(sequence.gaps[index - 1]!, { breakable, edge: false }));
    parts.push(printItem(ctx, item));
  }
  return fill(parts);
}

/**
 * The children of a container, indented, WITHOUT the run that follows them.
 *
 * Split out because whoever closes the container is not always its parent: a `@switch` case
 * is closed by the next label, which sits one level in, while the `}` of the `@switch` sits
 * at the outer one. Only the caller knows which.
 */
export function printInner(
  ctx: PrintContext,
  nodes: readonly HtmlContent[],
  breakable: boolean,
): Doc {
  const sequence = sequenceOf(nodes);
  return indent(
    concat([
      gapDoc(sequence.leading, { breakable, edge: true }),
      printItems(ctx, nodes, breakable),
    ]),
  );
}

/**
 * The children of a container, indented, with the runs at either edge.
 *
 * The trailing gap sits OUTSIDE the indent on purpose: it is the run that carries the
 * closing tag back to its parent's column.
 */
export function printChildren(
  ctx: PrintContext,
  nodes: readonly HtmlContent[],
  breakable: boolean,
): Doc {
  const sequence = sequenceOf(nodes);
  return concat([
    printInner(ctx, nodes, breakable),
    gapDoc(sequence.trailing, { breakable, edge: true }),
  ]);
}

/**
 * The document itself.
 *
 * Its edges are not runs between two pieces of content — there is nothing on the other side
 * — so they are dropped rather than rewritten, and the single terminating newline is added
 * by `format`. A file that begins with a blank line is not preserving anything.
 */
export function printRoot(ctx: PrintContext, nodes: readonly HtmlContent[]): Doc {
  return printItems(ctx, nodes, true);
}
