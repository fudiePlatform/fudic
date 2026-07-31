/**
 * What every printer needs, and the three questions it asks of it.
 *
 * The context is deliberately tiny. A printer that can reach the source, the already
 * formatted leaves and the options has everything; anything else it might want to carry —
 * a stack, a parent pointer, a "am I inside an inline element" flag — is an argument of the
 * call that needs it, so it cannot be stale.
 */

import { hardline, join, type Doc } from '../doc/index.js';
import type { LeafTable } from '../leaf/index.js';
import type { ResolvedOptions } from '../types.js';

export interface PrintContext {
  readonly source: string;
  readonly leaves: LeafTable;
  readonly options: ResolvedOptions;
}

/** The source, verbatim. */
export function sliceOf(ctx: PrintContext, span: { start: number; end: number }): string {
  return ctx.source.slice(span.start, span.end);
}

/**
 * The formatted text of a delegated fragment, or the source when nobody formatted it.
 *
 * The fallback is the collector's failure mode made explicit: a fragment the walk did not
 * find, or a leaf the engine declined, prints exactly as the user wrote it. Less formatted,
 * never wrong.
 */
export function leafOf(ctx: PrintContext, span: { start: number; end: number }): string {
  return ctx.leaves.get(span) ?? sliceOf(ctx, span);
}

/**
 * Multi-line text as a document that follows the indentation it is placed in.
 *
 * A delegated leaf comes back at column zero; turning its newlines into `hardline`s is what
 * moves it to wherever the printer decides it belongs, and it is the whole of "unwrap the
 * result and reindent it inside the `Doc`" (§4.2).
 */
export function reindent(text: string): Doc {
  return join(hardline, text.split('\n'));
}
