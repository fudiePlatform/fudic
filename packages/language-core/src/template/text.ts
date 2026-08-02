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

import type { RazorExpression } from '@fudic/compiler';
import type { TemplateContext } from './context.js';
import { copyExpression } from './expr.js';

/**
 * Project one interpolation.
 *
 * The expression is copied verbatim from its `expr` span — the JS only, without the `@` and
 * without the `( … )` of the explicit form — so hover and rename land on the user's own
 * characters, at their own columns.
 */
export function emitInterpolation(ctx: TemplateContext, expr: RazorExpression): void {
  ctx.w.scaffold('$text(', expr.span);
  copyExpression(ctx, expr.expr);
  ctx.w.scaffold(');\n');
}
