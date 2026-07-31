/**
 * Options in, resolved options out.
 *
 * With `exactOptionalPropertyTypes`, "a `Partial` enters and a resolved object circulates"
 * is the only shape under which no module downstream has to ask whether a field arrived.
 * That question, asked in twenty places, is how a formatter ends up with two defaults for
 * the same knob.
 */

import { resolveEndOfLine } from './eol.js';
import type { FormatOptions, ResolvedOptions } from './types.js';

/** The defaults of §3. */
export const DEFAULT_OPTIONS: Readonly<FormatOptions> = {
  printWidth: 100,
  useTabs: false,
  tabWidth: 2,
  quote: 'double',
  endOfLine: 'lf',
};

/**
 * Apply the defaults and answer `endOfLine: 'auto'` against the source.
 *
 * Nothing here validates: a negative `printWidth` is the caller's problem and the printer
 * simply breaks everything it can, which is the honest outcome. Rejecting it would mean a
 * failure mode that has nothing to do with the document.
 */
export function resolveOptions(
  source: string,
  partial?: Partial<FormatOptions>,
): ResolvedOptions {
  const merged = { ...DEFAULT_OPTIONS, ...partial };
  return {
    printWidth: merged.printWidth,
    useTabs: merged.useTabs,
    tabWidth: merged.tabWidth,
    quote: merged.quote,
    endOfLine: resolveEndOfLine(merged.endOfLine, source),
  };
}

/** One indentation level, as text. */
export function indentUnit(options: ResolvedOptions): string {
  return options.useTabs ? '\t' : ' '.repeat(options.tabWidth);
}
