/**
 * Control flow (§4.5).
 *
 * The canonical shape of the grammar: `@if (…) {` opens with the brace on the same line,
 * and the closing brace carries the `else` — `} else {`. That form is prescribed, so
 * normalizing to it is not the formatter having an opinion.
 *
 * The bodies are HTML content and go through `printChildren`, which means the runs inside
 * them are the source's, not this module's: a `@if (a) { <p>x</p> }` written on one line
 * stays on one line, and one written across four keeps its four.
 */

import { concat, group, indent, type Doc } from '../doc/index.js';
import type {
  ForeachNode,
  HtmlContent,
  IfNode,
  SwitchNode,
  WhileNode,
} from '@fudic/compiler';
import { leafOf, type PrintContext } from './context.js';
import { printChildren, printInner } from './content.js';
import { printComments, printGapBefore } from './trivia.js';

/**
 * The run that precedes a piece of `@switch` scaffolding, with any comment in the hole.
 *
 * Measured where the scaffolding IS, not at the end of the region before it: the span of a
 * case already swallows the whitespace that follows its body, so reading the hole between
 * two cases finds nothing, while reading backwards from the `case` finds the line break the
 * author put there.
 */
function printLabelGap(ctx: PrintContext, from: number, at: number): Doc {
  return printGapBefore(ctx.source, from, at);
}

/** `{ … }` around a body of HTML content. */
function block(ctx: PrintContext, body: readonly HtmlContent[]): Doc {
  return concat(['{', printChildren(ctx, body, true), '}']);
}

/**
 * `@if` with its `else if` arms and its `else`.
 *
 * Between one arm's `}` and the next `else` lies a hole the parser skipped; `printComments`
 * is what carries any comment in it across (decision 10, criterion 7).
 */
export function printIf(ctx: PrintContext, node: IfNode): Doc {
  const parts: Doc[] = [];

  for (const [index, branch] of node.branches.entries()) {
    if (index === 0) {
      parts.push('@if (');
    } else {
      parts.push(printComments(ctx.source, node.branches[index - 1]!.span.end, branch.span.start));
      parts.push('else if (');
    }
    parts.push(leafOf(ctx, branch.header.inner), ') ', block(ctx, branch.body));
  }

  if (node.elseBody !== undefined) {
    const last = node.branches[node.branches.length - 1]!;
    const bodyStart = node.elseBody[0]?.span.start ?? node.span.end;
    parts.push(printComments(ctx.source, last.span.end, bodyStart), 'else ', block(ctx, node.elseBody));
  }

  return group(concat(parts));
}

/**
 * `key (…)` between a loop's header and its body (decision 91).
 *
 * Always present on a loop the printer ever sees: without it the parse carries `FUD0540`,
 * and a document with diagnostics is not formatted at all (§4.6). The guard is what makes
 * that a fact of the code and not of the caller.
 */
function keyClause(ctx: PrintContext, node: ForeachNode | WhileNode): Doc {
  return node.key === undefined ? '' : concat(['key (', leafOf(ctx, node.key.expr), ') ']);
}

/** `@foreach` and `@for`: same shape, different header, both already delegated. */
export function printLoop(ctx: PrintContext, keyword: string, node: ForeachNode): Doc {
  return group(
    concat([
      `@${keyword} (`,
      leafOf(ctx, node.header.inner),
      ') ',
      keyClause(ctx, node),
      block(ctx, node.body),
    ]),
  );
}

/** `@while`. */
export function printWhile(ctx: PrintContext, node: WhileNode): Doc {
  return group(
    concat([
      '@while (',
      leafOf(ctx, node.header.inner),
      ') ',
      keyClause(ctx, node),
      block(ctx, node.body),
    ]),
  );
}

/**
 * `@switch` and its labels.
 *
 * Three holes the parser skipped, and all three are rescued: before the first label,
 * between labels, and after the last one.
 */
export function printSwitch(ctx: PrintContext, node: SwitchNode): Doc {
  const labels: Doc[] = [];
  let previousEnd = node.header.span.end;

  for (const branch of node.cases) {
    labels.push(printLabelGap(ctx, previousEnd, branch.span.start));
    labels.push(
      branch.test === undefined ? 'default:' : concat(['case ', leafOf(ctx, branch.test), ':']),
    );
    // The body without its trailing run: what follows a case is either the next label, one
    // level in, or the closing brace, one level out. The run before each of them is read
    // where it is, so neither inherits the other's column.
    labels.push(printInner(ctx, branch.body, true));
    previousEnd = branch.span.end;
  }

  return group(
    concat([
      '@switch (',
      leafOf(ctx, node.header.inner),
      ') {',
      indent(concat(labels)),
      // `node.span` ends just past the closing brace, so this is the run that precedes it.
      printLabelGap(ctx, previousEnd, node.span.end - 1),
      '}',
    ]),
  );
}
