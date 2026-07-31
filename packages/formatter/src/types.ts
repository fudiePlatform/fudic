/**
 * The public contract of the formatter (SDD-26 §3).
 *
 * Six options and no more. Every option multiplies the test matrix and buys nothing: the
 * zoo of knobs the old formatters carry is pure debt.
 */

import type { Diagnostic } from '@fudic/compiler';

/** How output lines are terminated. `auto` reads the first break of the SOURCE (§4). */
export type EndOfLine = 'lf' | 'crlf' | 'auto';

/** Which quote wraps an attribute value the formatter (re)writes. */
export type QuoteStyle = 'double' | 'single';

/** What a caller may set. Every field is optional at the door; none is optional inside. */
export interface FormatOptions {
  /** Column the printer tries not to exceed. Default 100. */
  printWidth: number;
  /** Indent with tabs instead of spaces. Default false. */
  useTabs: boolean;
  /** Width of one indentation level. Default 2. */
  tabWidth: number;
  /** Quote used for attribute values. Default `'double'`. */
  quote: QuoteStyle;
  /** Line terminator of the output. Default `'lf'`. */
  endOfLine: EndOfLine;
}

/**
 * Options with the defaults already applied, and `endOfLine` already decided.
 *
 * `auto` cannot survive into the printer: it is a question about the source, and a printer
 * that carries two possible terminators loses the determinism of §5 at the first
 * concatenation. It is answered once, at the door.
 */
export interface ResolvedOptions {
  readonly printWidth: number;
  readonly useTabs: boolean;
  readonly tabWidth: number;
  readonly quote: QuoteStyle;
  /** Resolved: never `'auto'`. */
  readonly endOfLine: 'lf' | 'crlf';
}

/**
 * The result of formatting.
 *
 * A file with parse errors is NOT formatted (§4.6): formatting an incomplete AST
 * reorganizes code the user is halfway through writing. The formatter never throws — it
 * returns the negative result.
 *
 * `notes` rides on the successful branch: they are things the formatter decided not to
 * touch (a fragment that does not parse, a `<style>` whose placeholders came back wrong),
 * never reasons to refuse. The output is still complete and still safe.
 */
export type FormatResult =
  | { readonly ok: true; readonly text: string; readonly notes: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };
