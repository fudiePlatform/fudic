/**
 * The `<style>` body, formatted behind placeholders (SDD-26 §4.3).
 *
 * Every Razor region is replaced by a placeholder that is lexically valid CSS, the body is
 * formatted, and each placeholder is put back by searching for it in the output.
 *
 * **Uniqueness is the requirement here, not length** — the opposite of the virtual file of
 * SDD-23 §4.5, where length is what matters because the text does not move. Here the text
 * does move: the placeholder has to be findable afterwards. Confusing the two criteria
 * breaks one of the two consumers.
 *
 * And one condition the spec could not have known: the placeholder is **lowercase**.
 * A CSS formatter normalizes property names, so `__FUD_P0__` in property position comes
 * back as `__fud_p0__` and the search finds nothing. Lowercase survives all five positions
 * a Razor region can occupy — value, at-rule parameter, property name, selector, comment.
 */

import type { Diagnostic, Span, StyleNode } from '@fudic/compiler';
import { styleNotFormatted } from '../diagnostics.js';
import type { ResolvedOptions } from '../types.js';
import type { LeafEngine } from './engine.js';

/** The body, formatted or verbatim, plus the note that says which. */
export interface CssLeafResult {
  readonly text: string;
  readonly note?: Diagnostic;
}

/** `__fud_p<n>__`: lowercase, and delimited so `__fud_p1__` is never inside `__fud_p11__`. */
function placeholderFor(index: number): string {
  return `__fud_p${index}__`;
}

/** How many times `needle` occurs in `haystack`. */
function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Format a `<style>` body.
 *
 * `span` is the body itself — what sits between `>` and `</style>` — and every part of the
 * node tiles it, which is what makes the substitution exact.
 */
export async function formatStyleBody(
  engine: LeafEngine,
  source: string,
  style: StyleNode,
  span: Span,
  indentColumns: number,
  options: ResolvedOptions,
): Promise<CssLeafResult> {
  const verbatim = source.slice(span.start, span.end);

  const regions: string[] = [];
  let masked = '';
  for (const part of style.parts) {
    const text = source.slice(part.span.start, part.span.end);
    if (part.type === 'css-text') {
      masked += text;
      continue;
    }
    masked += placeholderFor(regions.length);
    regions.push(text);
  }

  if (masked.trim() === '') return { text: verbatim };

  const out = await engine.format(
    { language: 'css', source: masked, indentColumns, singleQuote: false },
    options,
  );
  if (!out.ok) return { text: verbatim, note: styleNotFormatted(span, 'parse') };

  let restored = out.code;
  for (const [index, region] of regions.entries()) {
    const placeholder = placeholderFor(index);
    // Exactly once. Zero means the formatter swallowed it; more than once means it split a
    // rule and copied it. Either way the user's CSS is safer as they wrote it.
    if (countOf(restored, placeholder) !== 1) {
      return { text: verbatim, note: styleNotFormatted(span, 'placeholder') };
    }
    // The replacement is a FUNCTION: a Razor region carrying a `$` — and they do, the whole
    // compiler namespace is `$` — would otherwise be read as a substitution pattern.
    restored = restored.replace(placeholder, () => region);
  }

  return { text: restored };
}
