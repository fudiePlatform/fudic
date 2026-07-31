/**
 * The single place that touches the leaf formatter (SDD-26 §2, §4.1).
 *
 * It is a port on purpose. Not because a second implementation is planned — the spec calls
 * the choice «a substitution point, not a structural decision» — but because everything
 * this package promises about NOT failing is a promise about what happens when this call
 * misbehaves, and a promise nobody can provoke in a test is not a promise.
 *
 * `oxfmt` is the implementation: in-process NAPI, the same toolchain as `oxc-parser`, and
 * it formats TS and CSS through the same entry point.
 */

import { format as oxfmt } from 'oxfmt';
import type { ResolvedOptions } from '../types.js';

/** Which language a fragment is written in. The file name is what selects the parser. */
export type LeafLanguage = 'ts' | 'css';

/** A piece of source to format, on its own. */
export interface LeafRequest {
  readonly language: LeafLanguage;
  /** The text handed over, already wrapped if it needed a sentinel. */
  readonly source: string;
  /**
   * The column this fragment will sit at once the printer reindents it.
   *
   * The leaf is formatted against the width that will be LEFT for it, not against the full
   * margin: a `@code` body formatted at 100 columns and then indented by two is a hundred
   * and two columns wide, and the option the user set stops meaning anything.
   */
  readonly indentColumns: number;
  /**
   * Whether the JS in this fragment should prefer single quotes.
   *
   * True for an attribute value, and only there: `class:on="@(t === 'x')"` is delimited by
   * the attribute's own quote, so a JS string that reaches for the same one forces the
   * attribute to swap its delimiters and the line the author wrote comes back inside out.
   * The rule is symmetric — the fragment takes the quote the attribute did not.
   */
  readonly singleQuote: boolean;
}

/** What came back. `ok: false` means "this does not parse"; the code is then the input. */
export interface LeafOutput {
  readonly code: string;
  readonly ok: boolean;
}

/** The port. One method, because there is one question. */
export interface LeafEngine {
  format(request: LeafRequest, options: ResolvedOptions): Promise<LeafOutput>;
}

/**
 * Never ask for less than this many columns.
 *
 * Deep nesting would otherwise drive the available width to zero or below, and a formatter
 * asked to fit in no columns breaks after every token — which is worse than a long line, and
 * unstable besides.
 */
const MIN_WIDTH = 20;

const FILE_NAME: Readonly<Record<LeafLanguage, string>> = {
  ts: 'fragment.ts',
  css: 'fragment.css',
};

/** The real engine. `endOfLine` is always `lf`: the terminator is applied once, at the end. */
export const oxfmtEngine: LeafEngine = {
  async format(request: LeafRequest, options: ResolvedOptions): Promise<LeafOutput> {
    const result = await oxfmt(FILE_NAME[request.language], request.source, {
      printWidth: Math.max(options.printWidth - request.indentColumns, MIN_WIDTH),
      singleQuote: request.singleQuote,
      useTabs: options.useTabs,
      tabWidth: options.tabWidth,
      endOfLine: 'lf',
      insertFinalNewline: false,
    });
    return { code: result.code, ok: result.errors.length === 0 };
  },
};
