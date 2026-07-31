/**
 * Whitespace compaction for the component `<style>` body (BUG-08).
 *
 * A JS minifier does not enter a template literal, so the CSS that travels inside
 * `export const css = \`…\`` is the one part of the output no later tool can reach. It has
 * to leave the emit already compacted, and the emit is the only place where that is safe
 * to do — here the sheet is not a string, it is a `StyleNode` the compiler already parsed.
 *
 * Two rules make this conservative enough to be unconditional:
 *
 * - Only `CssText` is compacted. `RazorExpression`, `AtEscapeNode` and `RazorCommentNode`
 *   go out verbatim, spans intact, because they are user code Oxc validated and the
 *   source maps resolve through them (§4.1).
 * - Never ACROSS two parts. An interpolation can sit in the middle of a declaration —
 *   `padding: @(size)rem @(size * 2)rem` — and the space next to it separates two values
 *   the compiler cannot evaluate. Each `CssText` is compacted on its own (§4.2).
 *
 * What it does NOT do is as deliberate: comments are kept (§4.3, decision 49 — dropping
 * them is a second decision, and it would take a `/*! license *\/` with it), and nothing
 * is merged, reordered or deduplicated. That needs the cascade, and it is out of scope.
 */

import type { StyleNode } from '../css/index.js';

/** Punctuation that never needs the whitespace BEFORE it. */
const TIGHT_BEFORE = new Set(['{', '}', ';']);

/**
 * Punctuation that never needs the whitespace AFTER it. `:` is here and deliberately NOT
 * in `TIGHT_BEFORE`: `color: red` loses its space, but `a :hover` — a descendant that is
 * hovered — keeps it. Removing the space before a `:` would silently turn that selector
 * into `a:hover`, a different rule; the byte it would have saved is not worth a selector.
 */
const TIGHT_AFTER = new Set(['{', '}', ';', ':']);

const SPACE = /\s/u;

/**
 * End of the string literal that starts at `start`, past its closing quote. Its content is
 * copied verbatim: whitespace inside `content: "a   b"` is text the page renders, not
 * formatting. An unterminated literal runs to the end of the run — this is the emit, the
 * parser already had its say, and there is nothing to report here.
 */
function endOfString(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return text.length;
}

/**
 * One literal CSS run, compacted: runs of whitespace to a single space, and no whitespace
 * around `{`, `}`, `;` or after `:`.
 *
 * A leading run of whitespace becomes a single space rather than nothing, because the run
 * may follow an interpolation and the two are not continuous (§4.2). The sheet's own outer
 * whitespace is trimmed once, at the end, by `compactStyleCss`.
 */
export function compactCss(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = endOfString(text, i);
      out += text.slice(i, end);
      i = end;
      continue;
    }
    if (SPACE.test(ch)) {
      let end = i + 1;
      while (end < text.length && SPACE.test(text[end]!)) end += 1;
      if (!TIGHT_AFTER.has(out.slice(-1))) out += ' ';
      i = end;
      continue;
    }
    if (TIGHT_BEFORE.has(ch) && out.endsWith(' ')) out = out.slice(0, -1);
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * The compacted body of a parsed `<style>`. The parts tile the body span with no gaps and
 * no overlaps (`css/nodes.ts`), which is what makes this walk complete by construction:
 * every byte of the source body is either compacted as text or copied verbatim.
 */
export function compactStyleCss(source: string, style: StyleNode): string {
  let out = '';
  for (const part of style.parts) {
    out +=
      part.type === 'css-text'
        ? compactCss(part.value)
        : source.slice(part.span.start, part.span.end);
  }
  return out.trim();
}
