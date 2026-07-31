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

import { errorDiag, infoDiag, span as spanOf, type Diagnostic, type Span } from '@fudic/compiler';

/** A `<style>` left untouched because its placeholders did not survive the CSS pass (§4.3). */
export const FUD_STYLE_NOT_FORMATTED = 'FUD0480';

/** A JS/TS fragment left untouched because it does not parse (§4.2). */
export const FUD_FRAGMENT_NOT_FORMATTED = 'FUD0481';

/** The formatter itself failed. The one code here that IS an error. */
export const FUD_INTERNAL_FAILURE = 'FUD0482';

// `FUD0483`–`FUD0499` are reserved.

/**
 * Something below the formatter threw.
 *
 * §5 says it never throws, and "never" has to mean something when the thing underneath is a
 * native binary in another process's worker pool. The file is returned unformatted, with the
 * reason attached, which is the same outcome the user gets from a syntax error: nothing
 * changed, and they can see why.
 */
export function internalFailure(source: string, error: unknown): Diagnostic {
  const reason = error instanceof Error ? error.message : String(error);
  return errorDiag(
    FUD_INTERNAL_FAILURE,
    `The formatter could not finish: ${reason}`,
    spanOf(0, source.length),
  );
}

/** Why a `<style>` was left alone. Both end the same way; the author deserves to know which. */
export type StyleFailure =
  /** The CSS came back without a placeholder, or with one twice. */
  | 'placeholder'
  /** The body does not parse as CSS. */
  | 'parse';

const STYLE_REASON: Readonly<Record<StyleFailure, string>> = {
  placeholder: 'a Razor region could not be restored after formatting',
  parse: 'it does not parse as CSS',
};

/**
 * The `<style>` is emitted exactly as written.
 *
 * Losing the user's code is not an option, so the whole body is copied verbatim. The span
 * is the style BODY: that is the region that did not change, and pointing at the element
 * would suggest the tag is the problem.
 */
export function styleNotFormatted(span: Span, reason: StyleFailure): Diagnostic {
  return infoDiag(
    FUD_STYLE_NOT_FORMATTED,
    `Left <style> unformatted: ${STYLE_REASON[reason]}`,
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
