/**
 * `@code`, its regions, `@{ … }` and `@section` (§4.1, §4.2).
 *
 * The inside of a `@code` is JavaScript, not HTML content: whitespace there reaches no
 * document, so the layout is chosen canonically — brace on the line of the keyword, one
 * level in, one blank line kept between parts that had one. Nothing here can violate the
 * run invariant, because there are no runs here to violate.
 *
 * `@section` is the exception in this file: its body IS HTML content, so it goes through
 * `printChildren` like any other block.
 */

import { concat, group, hardline, indent, line, type Doc } from '../doc/index.js';
import { gapOf } from '../space/index.js';
import type { CodeBlockNode, CodePart, InlineCodeNode, SectionNode } from '@fudic/compiler';
import { dedent } from '../leaf/index.js';
import { leafOf, reindent, type PrintContext } from './context.js';
import { printChildren } from './content.js';

const TRAILING_SPACE = /\s*$/;

/**
 * What goes between two parts of a `@code`.
 *
 * A neutral chunk's span already swallows the whitespace that follows it — that is where a
 * blank line before `@server` lives — and `dedent` has just removed it from the text. So the
 * run is read off the END of the previous part, not off the hole between the two, which is
 * usually empty. One break at minimum: parts are statements, and gluing two together would
 * not merely look wrong.
 */
function separator(ctx: PrintContext, previous: CodePart, next: CodePart): Doc {
  const tail = TRAILING_SPACE.exec(ctx.source.slice(previous.span.start, previous.span.end))![0];
  const gap = gapOf(tail + ctx.source.slice(previous.span.end, next.span.start));
  return gap.hasBlankLine ? concat([hardline, hardline]) : hardline;
}

/** `{ … }` around JS that came back from the leaf formatter at column zero. */
function braced(open: string, body: string): Doc {
  if (body === '') return `${open} {}`;
  return concat([`${open} {`, indent(concat([hardline, reindent(body)])), hardline, '}']);
}

/** One part of a `@code`: a neutral chunk, or a `@server` / `@client` region. */
function printCodePart(ctx: PrintContext, part: CodePart): Doc {
  // `dedent` here as well as in the leaf: a fragment the engine declined comes back as the
  // source slice, indentation and all, and the reindent below would then add a second one.
  const body = dedent(leafOf(ctx, part.js));
  if (part.type === 'neutral-js') return reindent(body);
  return braced(part.type === 'server-region' ? '@server' : '@client', body);
}

/** `@code { … }`. */
export function printCode(ctx: PrintContext, node: CodeBlockNode): Doc {
  if (node.parts.length === 0) return '@code {}';

  const parts: Doc[] = [];
  for (const [index, part] of node.parts.entries()) {
    if (index > 0) parts.push(separator(ctx, node.parts[index - 1]!, part));
    parts.push(printCodePart(ctx, part));
  }

  return concat(['@code {', indent(concat([hardline, concat(parts)])), hardline, '}']);
}

/** `@{ … }` — inline code, on one line when it fits there. */
export function printInlineCode(ctx: PrintContext, node: InlineCodeNode): Doc {
  const body = dedent(leafOf(ctx, node.group.inner));
  if (body === '') return '@{}';
  return group(concat(['@{', indent(concat([line, reindent(body)])), line, '}']));
}

/** `@section name { … }` — a route's contribution to its layout (SDD-21). */
export function printSection(ctx: PrintContext, node: SectionNode): Doc {
  return group(
    concat([`@section ${node.name} {`, printChildren(ctx, node.children, true), '}']),
  );
}
