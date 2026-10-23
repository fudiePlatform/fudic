/**
 * `@code`, `@{ … }` and `@section` (§4.1, §4.2).
 *
 * The inside of a `@code` is JavaScript, not HTML content: whitespace there reaches no
 * document, so the layout is chosen canonically — brace on the line of the keyword, one
 * level in. Nothing here can violate the run invariant, because there are no runs here to violate.
 *
 * `@section` is the exception in this file: its body IS HTML content, so it goes through
 * `printChildren` like any other block.
 */

import { concat, group, hardline, indent, line, type Doc } from '../doc/index.js';
import type { CodeBlockNode, CodePart, InlineCodeNode, SectionNode } from '@fudic/compiler';
import { dedent } from '../leaf/index.js';
import { leafOf, reindent, type PrintContext } from './context.js';
import { printChildren } from './content.js';

/**
 * One chunk of a `@code`. A retired `@server` / `@client` never reaches here: it is FUD1110,
 * and a file with a parse error is not formatted.
 */
function printCodePart(ctx: PrintContext, part: CodePart): Doc {
  // `dedent` here as well as in the leaf: a fragment the engine declined comes back as the
  // source slice, indentation and all, and the reindent below would then add a second one.
  return reindent(dedent(leafOf(ctx, part.js)));
}

/**
 * `@code { … }`. A formattable one holds a single chunk: what cuts a body in several is a
 * retired region, and that is a parse error (FUD1110).
 */
export function printCode(ctx: PrintContext, node: CodeBlockNode): Doc {
  if (node.parts.length === 0) return '@code {}';
  const body = concat(node.parts.map((part) => printCodePart(ctx, part)));
  return concat(['@code {', indent(concat([hardline, body])), hardline, '}']);
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
