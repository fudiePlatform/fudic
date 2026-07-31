/**
 * Entry point of `@fudic/formatter` (SDD-26).
 *
 * The formatter for `.fud` files: one printer over a document IR for the tree, and
 * delegation to `oxfmt` for the leaves that are real JS/TS or real CSS. The same binary
 * answers the editor (SDD-24) and the CLI (`fudic fmt`), because two code paths would
 * eventually disagree.
 */

export const VERSION = '0.0.1';

export type {
  EndOfLine,
  FormatOptions,
  FormatResult,
  QuoteStyle,
  ResolvedOptions,
} from './types.js';

export { DEFAULT_OPTIONS, indentUnit, resolveOptions } from './options.js';
export { applyEndOfLine, detectEndOfLine, resolveEndOfLine, stripCr } from './eol.js';
export {
  FUD_FRAGMENT_NOT_FORMATTED,
  FUD_STYLE_NOT_FORMATTED,
  fragmentNotFormatted,
  styleNotFormatted,
  type StyleFailure,
} from './diagnostics.js';

export { OPAQUE_ELEMENTS } from './tags.js';
export { oxfmtEngine, type LeafEngine, type LeafRequest, type LeafOutput } from './leaf/index.js';
