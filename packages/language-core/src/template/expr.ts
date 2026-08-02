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

import type { Span } from '@fudic/compiler';
import { COMPLETION_ONLY_CAPS } from '../caps.js';
import type { TemplateContext } from './context.js';

export function copyExpression(ctx: TemplateContext, expr: Span): void {
  if (expr.end > expr.start) ctx.w.copy(expr);
  else ctx.w.projected(' ', expr, COMPLETION_ONLY_CAPS);
}
