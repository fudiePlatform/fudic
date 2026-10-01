/**
 * The `<style>` body, formatted (SDD-26 §4.3).
 *
 * Since decision 136 (SDD-49) a `<style>` body is plain CSS: no Razor region lives in it, so
 * there is nothing to hide behind a placeholder and put back. The body goes to the CSS
 * formatter as it is, and comes back verbatim when the formatter cannot read it.
 */

import type { Diagnostic, Span, StyleNode } from '@fudic/compiler';
import { FUD0480 } from '@fudic/diagnostics';
import type { ResolvedOptions } from '../types.js';
import type { LeafEngine } from './engine.js';

/** The body, formatted or verbatim, plus the note that says which. */
export interface CssLeafResult {
  readonly text: string;
  readonly note?: Diagnostic;
}

/**
 * Format a `<style>` body.
 *
 * `span` is the body itself — what sits between `>` and `</style>`. `style` is its node, kept
 * in the signature for the callers that already pass it.
 */
export async function formatStyleBody(
  engine: LeafEngine,
  source: string,
  _style: StyleNode,
  span: Span,
  indentColumns: number,
  options: ResolvedOptions,
): Promise<CssLeafResult> {
  const verbatim = source.slice(span.start, span.end);
  if (verbatim.trim() === '') return { text: verbatim };

  const out = await engine.format(
    { language: 'css', source: verbatim, indentColumns, singleQuote: false, singleLine: false },
    options,
  );
  if (!out.ok) return { text: verbatim, note: FUD0480({ span }) };
  return { text: out.code };
}
