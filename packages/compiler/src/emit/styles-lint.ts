/**
 * What a project stylesheet cannot say (SDD-42 §4.5).
 *
 * A project sheet is adopted INTO shadow roots, and three selectors that are perfectly
 * ordinary in a document match nothing there: `:root`, `html` and `body`. The author who
 * writes them is writing dead code convinced of the opposite, which is the one thing worth
 * a diagnostic — everything else about the sheet is CSS the browser judges better.
 *
 * `FUD0743` is a WARNING and the sheet is emitted unchanged: the same file can legitimately
 * be served both ways — as the document's stylesheet and as the project's — and in the
 * document copy those rules are correct. Prohibiting them would force a split the author
 * has reasons not to make.
 *
 * It reads the AST of SDD-09 rather than the raw text, because `parts` tile the span with
 * no gaps and no overlaps (BUG-08 §2.2): whatever the parser resolved as literal CSS is
 * what this walks, and a Razor atom — which a `.css` cannot produce, but the parser can
 * still hand back for a stray `@` — contributes nothing to a selector.
 *
 * Who CALLS it is the host, once per sheet, and not the emit. The sheet travels into every
 * module the build emits, so the same rule stated at emit time would be one warning per
 * route for a single mistake. It is the same reason `FUD0742` lives in the plugin.
 */

import { parseStyle } from '../css/index.js';
import { warningDiag, type Diagnostic } from '../types/index.js';

/** A project sheet holds a rule whose selector only means something in the document. */
export const FUD_DOCUMENT_ONLY_SELECTOR = 'FUD0743';

/**
 * The document-only rules of a project stylesheet, in source order.
 *
 * `css` is the file as written; the spans are offsets into it, so the host can point at
 * the selector and not at the file.
 */
export function lintProjectStyle(css: string): readonly Diagnostic[] {
  const parsed = parseStyle(css, { start: 0, end: css.length });
  const found: Diagnostic[] = [];
  // The selector list being read, as text, plus where it sits in the file. The text is
  // accumulated instead of sliced because comments and strings are skipped while scanning:
  // `/* body */ .a {` and `[title="body"] {` are not what this is looking for.
  let prelude = '';
  let start = -1;
  let end = -1;

  for (const part of parsed.value.parts) {
    if (part.type !== 'css-text') continue;
    const text = part.value;
    const base = part.span.start;
    let i = 0;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '/' && text[i + 1] === '*') {
        const close = text.indexOf('*/', i + 2);
        i = close === -1 ? text.length : close + 2;
        continue;
      }
      if (c === '"' || c === "'") {
        i = endOfString(text, i);
        continue;
      }
      if (c === '{') {
        const name = documentOnly(prelude);
        if (name !== null) {
          found.push(warningDiag(FUD_DOCUMENT_ONLY_SELECTOR, messageFor(name), { start, end }));
        }
        prelude = '';
        start = -1;
        i++;
        continue;
      }
      if (c === '}' || c === ';') {
        // A block that closed, or a declaration — `color: red;` is not a selector, and
        // neither is `@import "…";`, which is why both reset the same way.
        prelude = '';
        start = -1;
        i++;
        continue;
      }
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f') {
        // Collapsed, and only once the list has started: `html    div` reads as `html div`
        // and a selector never starts with a descendant combinator.
        if (prelude !== '') prelude += ' ';
        i++;
        continue;
      }
      if (start === -1) start = base + i;
      end = base + i + 1;
      prelude += c;
      i++;
    }
  }

  return found;
}

/** The first document-only selector of a list, or `null` when it holds none. */
function documentOnly(list: string): string | null {
  // An at-rule prelude is not a selector list: `@media (min-width: 30em)` says nothing
  // about what matches, and what it wraps is scanned on its own anyway.
  if (list.startsWith('@')) return null;
  for (let i = 0; i < list.length; i++) {
    if (list.startsWith(':root', i) && !isName(list[i + 5])) return ':root';
    if (isTypeSelector(list, i, 'html')) return 'html';
    if (isTypeSelector(list, i, 'body')) return 'body';
  }
  return null;
}

/**
 * True when `name` sits at `i` as a TYPE selector — the start of a compound.
 *
 * The test is what precedes it: an element name can only follow a combinator, a comma, the
 * opening of a functional pseudo-class, or nothing at all. `.body`, `#body` and
 * `[data-x=body]` are none of those, and none of them is dead inside a shadow root.
 */
function isTypeSelector(list: string, i: number, name: string): boolean {
  if (!list.startsWith(name, i)) return false;
  if (isName(list[i + name.length])) return false;
  const before = list[i - 1];
  return before === undefined || before === ' ' || '>+~,('.includes(before);
}

/** A character that continues a CSS identifier. */
function isName(c: string | undefined): boolean {
  if (c === undefined) return false;
  return (
    (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    (c >= '0' && c <= '9') ||
    c === '-' ||
    c === '_'
  );
}

/** The offset just past the string that starts at `i`, escapes honoured. */
function endOfString(text: string, i: number): number {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    const c = text[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === quote) return j + 1;
    j++;
  }
  return text.length;
}

function messageFor(name: string): string {
  return (
    `a "${name}" rule in a project stylesheet matches nothing inside a shadow root — ` +
    'move it to the document stylesheet, the <link rel="stylesheet"> of the layout'
  );
}
