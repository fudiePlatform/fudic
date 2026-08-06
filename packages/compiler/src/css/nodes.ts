/**
 * The `<style>` body AST (SDD-09 §3). Deliberately FLAT: a `<style>` body is a
 * sequence of literal CSS runs interleaved with Razor atoms, in source order.
 *
 * There is no CSS rule tree in v1 (SDD-09 §7): the browser parses the real CSS,
 * the compiler only interpolates Razor and validates brace balance. Selectors,
 * declarations and specificity are explicitly out of scope.
 */

import type { Node } from '../types/index.js';
import type { AtEscapeNode, RazorExpression, RazorCommentNode } from '../at/index.js';

/**
 * A literal CSS run. Includes whitelisted at-rule keywords (`@media`), CSS
 * comments, and any `@` the disambiguation resolved as literal. Verbatim
 * passthrough: no decoding, no re-escaping. BUG-14 changed that for HTML text
 * and attribute values — a node's data is text — but a `<style>` body is not a
 * node's data: it is CSS, where `&lt;` means the four characters it spells.
 */
export interface CssText extends Node {
  readonly type: 'css-text';
  readonly value: string;
}

/**
 * One piece of a `<style>` body. `RazorExpression`, `AtEscapeNode` and
 * `RazorCommentNode` are the very same nodes HTML content produces, so SDD-11
 * validates them with Oxc and the emit interpolates them without caring whether
 * they came from markup or from CSS (SDD-09 §5).
 */
export type CssPart = CssText | RazorExpression | AtEscapeNode | RazorCommentNode;

/**
 * A parsed `<style>` body. `span` is exactly the body span handed to
 * `parseStyle` (the content between `>` and `</style>`), and `parts` tile it
 * with no gaps and no overlaps.
 */
export interface StyleNode extends Node {
  readonly type: 'style-content';
  readonly parts: readonly CssPart[];
}
