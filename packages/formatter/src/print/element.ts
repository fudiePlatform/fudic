/**
 * Elements: what sits between the two tags.
 *
 * The start tag is `tag.ts`'s; the shapes an element can take are this module's, and three
 * of them are decided by `ElementKind` alone — void, self-closing, opaque — which is why
 * there is no guessing here about which tags close themselves.
 */

import { concat, group, line, softline, type Doc } from '../doc/index.js';
import { breaksInside } from '../space/index.js';
import { OPAQUE_ELEMENTS } from '../tags.js';
import type { ElementNode, StyleNode } from '@fudic/compiler';
import type { PrintContext } from './context.js';
import { printChildren } from './content.js';
import { printOpaque } from './opaque.js';
import { printStyleElement } from './style.js';
import { printOpenTag } from './tag.js';

/**
 * An element.
 *
 * The `breakable` handed to the children is about THIS element: whether its own content may
 * be laid out one piece per line is a question about this tag, never about its parent's.
 */
export function printElement(ctx: PrintContext, element: ElementNode): Doc {
  if (element.kind === 'self-closing') return printOpenTag(ctx, element, concat([line, '/>']));
  if (element.kind === 'void') return printOpenTag(ctx, element, '>');

  const style = element.children.find((c): c is StyleNode => c.type === 'style-content');
  if (style !== undefined) return printStyleElement(ctx, element, style);

  if (OPAQUE_ELEMENTS.has(element.name)) return printOpaque(ctx, element);

  const close = `</${element.name}>`;
  if (element.children.length === 0) {
    // Nothing to glue the `>` to: it goes on its own line when the tag breaks (§4.5).
    return concat([printOpenTag(ctx, element, concat([softline, '>'])), close]);
  }

  return group(
    concat([
      printOpenTag(ctx, element, '>'),
      printChildren(ctx, element.children, breaksInside(element.name)),
      close,
    ]),
  );
}
