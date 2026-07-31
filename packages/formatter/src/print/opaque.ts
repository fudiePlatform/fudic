/**
 * `<script>`, `<pre>` and `<textarea>`: copied byte for byte (§4.4).
 *
 * Their own indentation included, and NOT reindented even when the element around them
 * changes level. Inside a `<pre>` the indentation is the render; inside a `<script>` it is
 * the program. There is no version of "improving" either that is not a change.
 *
 * The body reaches the document as one literal string. The printer inserts indentation only
 * where it breaks a line, so a string carrying its own newlines passes through untouched —
 * and, because it contains them, it also opens every group above it, which is correct: an
 * opaque region never sits on a shared line.
 */

import { concat, type Doc } from '../doc/index.js';
import type { ElementNode } from '@fudic/compiler';
import type { PrintContext } from './context.js';
import { printOpenTag } from './tag.js';

/**
 * An element whose body nobody formats. Its start tag is still the printer's.
 *
 * The body runs from the end of the start tag to the beginning of the close tag, and the
 * close tag is found by arithmetic rather than by asking for `closeSpan`: an opaque element
 * without one is an unclosed element, which is FUD0052, and a file with a parse error is
 * never formatted at all (§4.6). There is no branch here because there is no second case.
 */
export function printOpaque(ctx: PrintContext, element: ElementNode): Doc {
  const close = `</${element.name}>`;
  const body = ctx.source.slice(element.openSpan.end, element.span.end - close.length);
  return concat([printOpenTag(ctx, element, '>'), body, close]);
}
