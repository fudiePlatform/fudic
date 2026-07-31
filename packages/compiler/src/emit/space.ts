/**
 * The whitespace model of the emit (BUG-07 §4.4, §4.5).
 *
 * Under `white-space: normal` CSS says a run of spaces and newlines collapses to ONE
 * space, and that space renders. So collapsing a run to a single space is not an
 * optimisation with a rendering risk attached: it is exactly what the browser was going
 * to do, done earlier. Render-identical by construction, not by heuristic.
 *
 * This lives in the emit, and is ours, for the reason the HTML parser is ours: here the
 * facts are parsed. A text minifier receives a string and has to GUESS what is `<pre>`,
 * what is inline and what the CSS says; we have the AST and the component's own
 * stylesheet in the same file.
 *
 * And there is one thing no off-the-shelf minifier gets right on a fudic page. They
 * decide inline vs block from a fixed list of tags, and a custom element is in no list.
 * We know an unknown tag is a custom element and that its default `display` is `inline`
 * — so its surrounding whitespace is significant. On a page that is almost entirely
 * custom elements, that heuristic does not fail in the rare case, it fails in the normal
 * one. Which is also why a whitespace-only text node is COLLAPSED and never dropped: see
 * `collapseSpace`.
 */

import type { StyleNode } from '../css/index.js';
import type { AttributeText, AttributeValuePart, ElementNode } from '../html/index.js';

/** How the content of an element is emitted. */
export type SpaceMode = 'collapse' | 'preserve';

/**
 * The escape hatch for the one case that cannot be deduced (§4.4).
 *
 * `white-space` is INHERITED and it crosses the shadow boundary, so an ancestor in some
 * other file can put a component compiled here into a preserving context. Nothing in this
 * file can see that. `data-fud-space="preserve"` says so explicitly, applies to the
 * element's whole subtree, and — being a plain `data-` attribute — passes through to the
 * DOM, where it documents itself.
 */
export const SPACE_ATTR = 'data-fud-space';

/**
 * Elements whose whitespace is STRUCTURAL rather than stylistic. Both keep their content
 * verbatim no matter what any stylesheet says, so they are a fixed list and not a CSS
 * lookup: a `<pre>` whose author restyled it is still a `<pre>` in the source.
 */
const PREFORMATTED: ReadonlySet<string> = new Set(['pre', 'textarea']);

/**
 * A `white-space` (or `white-space-collapse`) declaration that PRESERVES: `pre`,
 * `pre-wrap`, `pre-line`, `break-spaces`, and the CSS Text 4 spelling `preserve`. Every
 * one of them starts with the same four letters, which is what the alternation exploits.
 */
const PRESERVING_DECL = /white-space(?:-collapse)?\s*:\s*[^;}]*\b(?:pre|break-spaces)/iu;

/** The literal CSS of a `<style>` body — the runs the AST knows are text, not Razor. */
function literalCss(style: StyleNode): string {
  return style.parts
    .map((part) => (part.type === 'css-text' ? part.value : ''))
    .join('\n');
}

/**
 * The mode an element's content is emitted in, from its tag and the stylesheet that
 * governs it (`null` when there is none, which is every element below the component root).
 *
 * Only the LITERAL runs of the stylesheet are read: a `white-space` computed by a Razor
 * interpolation is not knowable here, and `SPACE_ATTR` is the answer to anything this
 * cannot deduce.
 */
export function spaceModeOf(tag: string, style: StyleNode | null): SpaceMode {
  if (PREFORMATTED.has(tag.toLowerCase())) return 'preserve';
  if (style !== null && PRESERVING_DECL.test(literalCss(style))) return 'preserve';
  return 'collapse';
}

/**
 * The mode INSIDE `el`, given the mode around it. `white-space` inherits, so a preserving
 * context is never lost on the way down — only the explicit attribute and the two
 * preformatted tags can start one.
 */
export function nestedSpaceMode(inherited: SpaceMode, el: ElementNode): SpaceMode {
  if (staticAttrValue(el, SPACE_ATTR) === 'preserve') return 'preserve';
  if (inherited === 'preserve') return 'preserve';
  return spaceModeOf(el.name, null);
}

/**
 * The value of a static attribute, or `null` when absent or interpolated.
 *
 * Typed against `AttributeText` rather than a loose `{ value?: string }`, so the join
 * needs no fallback: a text part always carries its run. There is no `?? ''` here because
 * there is no case for it — an unreachable branch is either missing a test or is code
 * that should not exist.
 */
function staticAttrValue(el: ElementNode, name: string): string | null {
  for (const attr of el.attributes) {
    if (attr.name !== name) continue;
    const isText = (p: AttributeValuePart): p is AttributeText => p.type === 'attribute-text';
    if (!attr.value.every(isText)) return null;
    return attr.value.map((p) => p.value).join('');
  }
  return null;
}

/**
 * The HTML space characters, and ONLY those. Not `\s`, which also matches U+00A0 and the
 * rest of the Unicode spaces: a non-breaking space is content, and collapsing one into an
 * ordinary space would change what the page renders.
 */
const SPACE_RUN = /[ \t\n\f\r]+/gu;

/**
 * Collapse every run of whitespace to a single space. Never trims, never returns empty.
 *
 * The one rule here that classic minifiers do not follow, and the reason is worth keeping
 * next to the code. With `collapseWhitespace` they DELETE a whitespace-only text node
 * when it falls between two block elements — and they decide "block" from a tag list a
 * custom element is not in. Deleting it changes three observable things:
 *
 *  - **Slots.** A whitespace-only text node counts as assigned content: remove it and a
 *    `<slot>` that was filled starts showing its fallback.
 *  - **`:empty`.** An element holding a whitespace node is not `:empty`. Remove it and it
 *    is, and rules that did not apply start applying.
 *  - **Inline spacing** between two adjacent custom elements, which simply disappears.
 *
 * And it does not pay: measured on this project's own output, deleting buys 0.4 % gzip
 * over collapsing (§4.5). One space is what the browser renders anyway — 100 % of the
 * benefit, 0 % of the risk.
 */
export function collapseSpace(text: string): string {
  return text.replace(SPACE_RUN, ' ');
}
