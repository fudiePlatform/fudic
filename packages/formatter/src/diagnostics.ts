/**
 * The formatter's own diagnostic catalogue: `FUD0480`–`FUD0499`.
 *
 * SDD-24 owns `FUD0460`–`FUD0479`, so `FUD0480` is the next free code. There are only two,
 * and neither is an error: both say "this region was left exactly as the user wrote it".
 * That is the shape of every problem a formatter can have — it never fails to format, it
 * declines to, and the user is entitled to know where.
 *
 * They ride on the `ok: true` branch as notes. A note is not a reason to refuse: the output
 * is complete and safe either way, and returning `ok: false` because one `@(…)` does not
 * parse would stop the whole file from being formatted over a fragment the user is still
 * typing.
 */

import { infoDiag, type Diagnostic, type Span } from '@fudic/compiler';

/** A `<style>` left untouched because its placeholders did not survive the CSS pass (§4.3). */
export const FUD_STYLE_NOT_FORMATTED = 'FUD0480';

/** A JS/TS fragment left untouched because it does not parse (§4.2). */
export const FUD_FRAGMENT_NOT_FORMATTED = 'FUD0481';

// `FUD0482`–`FUD0499` are reserved.

/**
 * The CSS came back without a placeholder, or with one twice.
 *
 * Losing the user's code is not an option, so the whole `<style>` is emitted verbatim. The
 * span is the style BODY: that is the region that did not change, and pointing at the
 * element would suggest the tag is the problem.
 */
export function styleNotFormatted(span: Span): Diagnostic {
  return infoDiag(
    FUD_STYLE_NOT_FORMATTED,
    'Left <style> unformatted: a Razor region could not be restored after formatting',
    span,
  );
}

/**
 * The fragment does not parse as JS, so it is printed as written.
 *
 * A broken fragment must not stop the rest of the file from being formatted (§4.2) — while
 * a header is being typed it is broken by definition, and that is the exact moment the
 * editor asks to format.
 */
export function fragmentNotFormatted(span: Span): Diagnostic {
  return infoDiag(
    FUD_FRAGMENT_NOT_FORMATTED,
    'Left this expression unformatted: it does not parse as JavaScript',
    span,
  );
}
