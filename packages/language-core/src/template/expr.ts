/**
 * Copying a user expression, including the one that is not there yet (SDD-23 §4.4).
 *
 * Every `@` construct projects the JS the user wrote by copying its `expr` span. While it is
 * being typed that span is EMPTY — `@()`, `name="@()"`, `@if ()` — and an empty copy writes
 * nothing and records no mapping, so the position maps nowhere and the editor cannot ask
 * TypeScript what may go there. Which is precisely the moment it needs to.
 *
 * A single space under `COMPLETION_ONLY_CAPS` stands in for it: something to map to, and only
 * completion routes through it. No diagnostic lands on a stretch the user cannot see, and no
 * hover or rename reaches into invented text.
 *
 * It lives in its own module because it was once inlined in ONE emitter — the component props
 * — and every other construct silently lacked it.
 */

import type { RazorExpression, Span } from '@fudic/compiler';
import { COMPLETION_ONLY_CAPS } from '../caps.js';
import type { TemplateContext } from './context.js';

export function copyExpression(ctx: TemplateContext, expr: Span, dangling?: Span): void {
  if (expr.end > expr.start) ctx.w.copy(expr);
  else ctx.w.projected(' ', expr, COMPLETION_ONLY_CAPS);
  if (dangling !== undefined) copyDangling(ctx, dangling);
}

/** The same, from the node — which is where the dangling dot lives. */
export function copyRazor(ctx: TemplateContext, expr: RazorExpression): void {
  copyExpression(ctx, expr.expr, expr.dangling);
}

/**
 * The `.` (or `?.`) the author has typed with no name behind it yet (decision 102).
 *
 * `$text(data.);` is INCOMPLETE TypeScript on purpose. The checker recovers, answers the
 * member list of `data` — which is the one thing wanted at that instant — and its own
 * «Identifier expected» lands on a stretch with no `verification`, so it reaches nobody.
 *
 * Without it there was no position to ask from at all: the dot is not part of the node's
 * span, so the cursor after it fell outside the copy. That is why `@(data.title)` was the
 * only way to make the dot complete, and why the BUG is named after the escape hatch.
 */
function copyDangling(ctx: TemplateContext, dangling: Span): void {
  ctx.w.projected(
    ctx.source.slice(dangling.start, dangling.end),
    dangling,
    COMPLETION_ONLY_CAPS,
  );
}
