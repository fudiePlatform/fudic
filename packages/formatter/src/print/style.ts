/**
 * The `<style>` element (§4.3).
 *
 * Its body is the one leaf that is not JS, and it arrives from the leaf table already
 * formatted — or already verbatim, when a placeholder did not survive. Either way it comes
 * back at column zero, so `dedent` is applied before reindenting: for formatted CSS it is a
 * no-op, and for a body copied as written it removes exactly the indentation the author had
 * it at, so the reindent that follows does not add a second one.
 */

import { concat, group, indent, hardline, type Doc } from '../doc/index.js';
import { dedent } from '../leaf/index.js';
import type { ElementNode, StyleNode } from '@fudic/compiler';
import { leafOf, reindent, type PrintContext } from './context.js';
import { printOpenTag } from './tag.js';

/** `<style>` with its formatted body, one level in. */
export function printStyleElement(
  ctx: PrintContext,
  element: ElementNode,
  style: StyleNode,
): Doc {
  const body = dedent(leafOf(ctx, style.span));
  const open = printOpenTag(ctx, element, '>');
  const close = `</${element.name}>`;
  if (body === '') return group(concat([open, close]));
  return group(concat([open, indent(concat([hardline, reindent(body)])), hardline, close]));
}
