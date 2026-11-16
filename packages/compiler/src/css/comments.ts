/**
 * The comments of a stretch of CSS: what a `fud-disable` is written in, inside a `<style>` or a
 * `.css` file. Strings are skipped, so a `/*` inside `content: "/*"` is not one. An unclosed
 * comment runs to the end of the stretch, as the browser reads it.
 */

import type { Span } from '../types/index.js';

/** A comment as written, its delimiters included. */
export interface CssComment {
  readonly span: Span;
  readonly text: string;
}

/** The comments of `source` between `from` and `to` (the whole text by default). */
export function cssComments(source: string, from = 0, to = source.length): readonly CssComment[] {
  const out: CssComment[] = [];
  let i = from;
  while (i < to) {
    const c = source[i]!;
    if (c === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close < 0 || close + 2 > to ? to : close + 2;
      out.push({ span: { start: i, end }, text: source.slice(i, end) });
      i = end;
    } else if (c === '"' || c === "'") {
      i = pastString(source, i, to);
    } else {
      i += 1;
    }
  }
  return out;
}

/** Past the string that opens at `i`: its closing quote, or the end of its line. */
function pastString(source: string, i: number, to: number): number {
  const quote = source[i];
  let j = i + 1;
  while (j < to && source[j] !== quote && source[j] !== '\n') {
    j += source[j] === '\\' ? 2 : 1;
  }
  return j + 1;
}
