/**
 * The default-`display` table (SDD-26 §4.5).
 *
 * What it is NOT: a correctness device. Correctness is the run invariant of `runs.ts` — the
 * printer never creates nor destroys a whitespace run, only rewrites one — and that holds
 * whatever this table says. A newline and a space between two elements render identically;
 * what does not render identically is a break where there was no whitespace at all, and
 * that case is closed by construction.
 *
 * What it IS: the aesthetic half. Two classes of information, kept separate because they
 * answer different questions:
 *
 *   - **outside** — is this element inline-level? Then the formatter does not introduce
 *     break opportunities around its content: §4.5 asks for a long line rather than a
 *     reflowed one, and inside inline content a rewritten run is visible in the diff even
 *     when it is invisible in the render.
 *   - **inside** — does its content lay out as blocks? Then children may go one per line.
 *
 * `inline-block` is the pair that differs on the two: inline from the outside, block within.
 *
 * **A custom element is `inline` unless proven otherwise** (§4.5). It is the conservative
 * assumption: breaking inside an inline container is a visible change, while not breaking
 * inside a block one is merely a long line.
 */

/** The three classes of §4.5. */
export type Display = 'inline' | 'block' | 'inline-block';

/**
 * Elements that lay out as blocks, inside and out.
 *
 * Metadata elements (`<title>`, `<meta>`, `<style>`) are here too: they render nothing, so
 * there is no inline context around them to disturb, and treating them as blocks is what
 * puts one `<link rel="component">` per line.
 */
const BLOCK: ReadonlySet<string> = new Set([
  'address', 'article', 'aside', 'base', 'blockquote', 'body', 'caption', 'col', 'colgroup',
  'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer',
  'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html',
  'legend', 'li', 'link', 'main', 'menu', 'meta', 'nav', 'noscript', 'ol', 'optgroup',
  'option', 'p', 'pre', 'script', 'section', 'style', 'summary', 'table', 'tbody', 'td',
  'template', 'tfoot', 'th', 'thead', 'title', 'tr', 'ul',
]);

/**
 * Inline-level from the outside, block from within: their content may go one per line, but
 * the whitespace around them belongs to an inline formatting context.
 */
const INLINE_BLOCK: ReadonlySet<string> = new Set([
  'audio', 'button', 'canvas', 'embed', 'iframe', 'img', 'input', 'math', 'meter', 'object',
  'progress', 'select', 'svg', 'textarea', 'video',
]);

/**
 * The default display of a tag. Everything unlisted — every custom element — is `inline`.
 *
 * The lookup is case-insensitive for HTML, which is what the parser hands over verbatim
 * (decision 41); `svg` and `math` are case-sensitive in the source but their own names are
 * lowercase either way.
 */
export function displayOf(tag: string): Display {
  const name = tag.toLowerCase();
  if (BLOCK.has(name)) return 'block';
  if (INLINE_BLOCK.has(name)) return 'inline-block';
  return 'inline';
}

/** Whether whitespace around this element belongs to an inline formatting context. */
export function isInlineLevel(tag: string): boolean {
  return displayOf(tag) !== 'block';
}

/** Whether the formatter may introduce break opportunities between this element's children. */
export function breaksInside(tag: string): boolean {
  return displayOf(tag) !== 'inline';
}
