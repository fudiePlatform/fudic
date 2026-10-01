/**
 * The `<style>` body AST (SDD-09 §3, decision 136). A `<style>` body is plain CSS, so the node
 * holds ONE literal run — none when the body is empty.
 *
 * There is no CSS rule tree here: the browser parses the real CSS, and the compiler only
 * validates brace balance and that no Razor was written (`FUD0132`). The rule tree of a plain
 * sheet, for the prune, is `rules.ts`.
 */

import type { Node } from '../types/index.js';

export interface CssText extends Node {
  readonly type: 'css-text';
  readonly value: string;
}

/** One piece of a `<style>` body: since decision 136, only literal CSS. */
export type CssPart = CssText;

/**
 * A parsed `<style>` body. `span` is exactly the body span handed to
 * `parseStyle` (the content between `>` and `</style>`), and `parts` covers it: one run,
 * or none for an empty body.
 */
export interface StyleNode extends Node {
  readonly type: 'style-content';
  readonly parts: readonly CssPart[];
}
