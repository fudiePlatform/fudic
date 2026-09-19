/**
 * `@snippet` and `@render` (SDD-29 §4.1, §4.7).
 *
 * Neither node has a layout of its own. A declaration is shaped exactly like a `@section`
 * — keyword, name, a delegated header, and a braced body of HTML content that goes through
 * `printChildren` — and a call is shaped like a control construct without a body: keyword
 * plus header. That is §7 of SDD-29 taken literally: the body IS an `html_block`, so every
 * decision about its layout was already made by the modules that print one.
 *
 * Printing them at all is the whole point. Left to the default branch of the dispatch they
 * came out as the source slice, which is correct only while nothing around them moves: a
 * `@render` whose arguments span two lines kept the columns it was typed at even after its
 * container was re-indented, and a body written flush left stayed flush left inside a file
 * the formatter had otherwise straightened out.
 */

import { concat, group, type Doc } from '../doc/index.js';
import type { RenderArg, RenderCallNode, SnippetDeclNode } from '@fudic/compiler';
import { printChildren } from './content.js';
import { leafOf, reindent, type PrintContext } from './context.js';

/** One argument: `expr`, or `name: expr` (decision 12 — the separator is `:`). */
function printArg(ctx: PrintContext, arg: RenderArg): Doc {
  const value = reindent(leafOf(ctx, arg.value));
  return arg.type === 'named-arg' ? concat([`${arg.name}: `, value]) : value;
}

/** `@snippet name(firma) { … }`. */
export function printSnippet(ctx: PrintContext, node: SnippetDeclNode): Doc {
  return group(
    concat([
      `@snippet ${node.name}(`,
      reindent(leafOf(ctx, node.signature)),
      ') {',
      printChildren(ctx, node.children, true),
      '}',
    ]),
  );
}

/** `@render (ns.)?name(args)`. */
export function printRender(ctx: PrintContext, node: RenderCallNode): Doc {
  const parts: Doc[] = ['@render '];
  if (node.namespace !== undefined) parts.push(`${node.namespace.name}.`);
  parts.push(`${node.name}(`);
  for (const [index, arg] of node.args.entries()) {
    if (index > 0) parts.push(', ');
    parts.push(printArg(ctx, arg));
  }
  parts.push(')');
  return group(concat(parts));
}
