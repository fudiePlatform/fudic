/**
 * The line terminator, decided once and applied last.
 *
 * Everything upstream of here works in `\n`. The conversion is the LAST operation on the
 * output text, for the reason §5 gives: determinism. A printer that carries two possible
 * terminators has to remember which one it is holding at every concatenation, and the
 * first place it forgets produces a file with both.
 */

import type { EndOfLine } from './types.js';

/**
 * What `endOfLine: 'auto'` resolves to for this source: the FIRST break decides.
 *
 * The first one, not a majority vote — a mixed file has no correct answer and a count
 * would make the answer depend on how much of the file the user has edited today.
 */
export function detectEndOfLine(source: string): 'lf' | 'crlf' {
  const at = source.indexOf('\n');
  if (at <= 0) return 'lf';
  return source[at - 1] === '\r' ? 'crlf' : 'lf';
}

/** Rewrite `\n` into the resolved terminator. The output holds no `\r` before this call. */
export function applyEndOfLine(text: string, eol: 'lf' | 'crlf'): string {
  return eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text;
}

/**
 * Strip `\r` from the source before anything reads it.
 *
 * Spans are UTF-16 offsets into the ORIGINAL text, so this would break them — which is why
 * it is NOT used on the way in. It exists for the leaf formatters, whose input is a slice
 * we hand over and whose output we reindent ourselves: a `\r` surviving in there would
 * reach the output through a path the terminator conversion never sees.
 */
export function stripCr(text: string): string {
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

/** Resolve the option against the source. `auto` is answered here and nowhere else. */
export function resolveEndOfLine(option: EndOfLine, source: string): 'lf' | 'crlf' {
  return option === 'auto' ? detectEndOfLine(source) : option;
}
