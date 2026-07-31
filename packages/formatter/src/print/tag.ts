/**
 * The start tag and its attributes (§4.5).
 *
 * This is the visible half of the formatter: with more than one attribute and a line that
 * does not fit, one per line with the `>` glued to the last — or alone on its own line when
 * the element has no children, where there is nothing for it to be glued to. A binding is
 * never broken from within: `class:success="@(tone === 'success')"` is one token here.
 *
 * It lives apart from `element.ts` because the opaque elements need it too, and a tag is
 * not the thing that is opaque about them.
 */

import { concat, group, hardline, indent, line, type Doc } from '../doc/index.js';
import type { Attribute, ElementNode } from '@fudic/compiler';
import { leafOf, sliceOf, type PrintContext } from './context.js';

/** The quote to wrap a rebuilt value in: the preferred one, unless the value holds it. */
function quoteFor(ctx: PrintContext, value: string): string {
  const preferred = ctx.options.quote === 'single' ? "'" : '"';
  if (!value.includes(preferred)) return preferred;
  return preferred === '"' ? "'" : '"';
}

/** The value of an attribute: literal runs verbatim, Razor atoms through the leaf table. */
function attributeValue(ctx: PrintContext, attribute: Attribute): string {
  let out = '';
  for (const part of attribute.value) {
    if (part.type === 'attribute-text') {
      out += part.value;
      continue;
    }
    const inner = leafOf(ctx, part.expr);
    out += part.kind === 'explicit' ? `@(${inner})` : `@${inner}`;
  }
  return out;
}

/**
 * One attribute.
 *
 * An attribute with no value parts is printed VERBATIM: `hidden` and `hidden=""` mean the
 * same thing (decision 44) and the AST cannot tell them apart, so rebuilding one would
 * silently rewrite the other.
 */
export function printAttribute(ctx: PrintContext, attribute: Attribute): Doc {
  if (attribute.value.length === 0) return sliceOf(ctx, attribute.span);

  const value = attributeValue(ctx, attribute);
  const quote = quoteFor(ctx, value);

  if (typeof attribute.name === 'string') return `${attribute.name}=${quote}${value}${quote}`;

  // `bus:(expr)="@h"` (decision 28.b): the prefix is source, the expression is a leaf.
  const prefix = ctx.source.slice(attribute.span.start, attribute.name.expr.start - 1);
  return `${prefix}(${leafOf(ctx, attribute.name.expr)})=${quote}${value}${quote}`;
}

/**
 * The run between the tag name (or the previous attribute) and this one.
 *
 * An attribute the author already put on its own line stays on its own line — the same rule
 * the content follows, applied inside the tag. It is what makes the three-attribute `<span>`
 * of `app-badge.fud` stable: it fits in a hundred columns, so a formatter that only asked
 * "does it fit" would join it back up on every save, and the author's answer to "is this
 * list long enough to break" would be overruled once and never asked again.
 */
function separatorBefore(ctx: PrintContext, from: number, to: number, only: boolean): Doc {
  if (ctx.source.slice(from, to).includes('\n')) return hardline;
  // "With MORE THAN ONE attribute and a line that does not fit" (§4.5): a lone attribute is
  // never taken off its tag. Breaking there buys one column and costs a shape nobody writes
  // — and it is what would put `<app-badge tone="…">` on two lines.
  return only ? ' ' : line;
}

/**
 * The `<name …` of an element, plus whatever closes the tag.
 *
 * Always a group, even with no attributes: the tail may carry a break opportunity — the
 * space before a `/>`, the `>` of a childless element — and a break opportunity outside a
 * group is not an opportunity, it is a break.
 */
export function printOpenTag(ctx: PrintContext, element: ElementNode, tail: Doc): Doc {
  if (element.attributes.length === 0) return group(concat(['<', element.name, tail]));

  const attributes: Doc[] = [];
  let previousEnd = element.openSpan.start + 1 + element.name.length;
  const only = element.attributes.length === 1;
  for (const attribute of element.attributes) {
    attributes.push(separatorBefore(ctx, previousEnd, attribute.span.start, only));
    attributes.push(printAttribute(ctx, attribute));
    previousEnd = attribute.span.end;
  }
  return group(concat(['<', element.name, indent(concat(attributes)), tail]));
}
