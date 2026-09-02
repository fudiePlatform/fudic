/**
 * Content interpolation (SDD-23 §4.4).
 *
 *     @data.title   →  $text(data.title);
 *     @(a ? b : c)  →  $text(a ? b : c);
 *
 * `$text` takes a `$Scalar`, so decision 19 — only scalar primitives interpolate — is
 * enforced by the checker: `@data` where `data` is an object fails with `TS2345`, pointing
 * at the expression the user wrote. No validator of ours is involved.
 */

import { span, type RazorExpression, type TextNode } from '@fudic/compiler';
import { COMPLETION_ONLY_CAPS } from '../caps.js';
import type { TemplateContext } from './context.js';
import { copyRazor } from './expr.js';

/**
 * Project one interpolation.
 *
 * The expression is copied verbatim from its `expr` span — the JS only, without the `@` and
 * without the `( … )` of the explicit form — so hover and rename land on the user's own
 * characters, at their own columns.
 */
export function emitInterpolation(ctx: TemplateContext, expr: RazorExpression): void {
  ctx.w.scaffold('$text(', expr.span);
  copyRazor(ctx, expr);
  ctx.w.scaffold(');\n');
}

/** A `@` that opens nothing yet, at the very end of a text node: `<p>hola @|</p>`. */
const DANGLING_AT = /(?:^|[^@\w])@$/u;

/**
 * The `@` the author has just pressed in markup, with nothing behind it yet.
 *
 * The tokenizer scans a `RazorExpression` only where an identifier begins, so a lone `@` is
 * still a TEXT node — and text projects to nothing. That left the one position where the list
 * is wanted mapping nowhere, so TypeScript was never asked and only the server's snippets could
 * answer. Both belong there: the constructs a `@` may open, and every name in scope.
 *
 * The anchor is zero-length and sits AFTER the `@`, the arithmetic `emitOpenHandler` explains:
 * Volar maps with `Math.min(relativePos, generatedLength)`, so a stretch covering the `@` would
 * push the caret past the hole.
 *
 * Only at the END of the node, which is where a caret can be: a `@` in the middle of a sentence
 * is text somebody wrote, and decision 1 spells the literal `@@` anyway.
 */
export function emitDanglingAt(ctx: TemplateContext, node: TextNode): void {
  if (!DANGLING_AT.test(node.value)) return;

  ctx.w.scaffold('$text(');
  ctx.w.projected(' ', span(node.span.end, node.span.end), COMPLETION_ONLY_CAPS);
  ctx.w.scaffold(');\n');
}
