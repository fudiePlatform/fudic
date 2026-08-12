/**
 * The `<script type="application/json">` blocks a page publishes for the hydration runtime:
 * `fud-state`, `fud-tree` and `fud-bus` (SDD-15 §3.3–§3.5).
 *
 * They hang off `$body` as REAL nodes, right before it is serialized, and not as loose text
 * yielded next to it: one serialization, one escaping discipline, and a `<script>` that the
 * parser sees where the tree says it is.
 *
 * `script` is in `RAWTEXT_ELEMENTS`, so its text comes out UNESCAPED — which is what an
 * `application/json` payload needs, and exactly what makes escaping it here mandatory: a
 * `</script` inside any string of the payload closes the block, and everything after it is
 * markup. Hence `escapeJson` below, and hence it lives next to the only caller that could
 * forget it.
 */

import { type Dom } from '@fudic/dom';
import { type SsrNode } from './tree.js';

/**
 * The characters that must not travel raw: `<`, and the two JavaScript line terminators that
 * JSON allows raw inside a string (U+2028, U+2029).
 */
const UNSAFE = new RegExp('[<\\u2028\\u2029]', 'gu');

/**
 * Escape a JSON text for embedding in a rawtext `<script>`, each character as its own
 * `\uXXXX` form.
 *
 * Every `<` goes. That one substitution neutralizes `</script`, `<script` and `<!--` at once
 * — the three sequences the HTML parser looks for inside a script — without touching the
 * validity of the JSON: `JSON.parse` gives back the original `<`, so the value the runtime
 * reads is character-for-character the value the server held.
 *
 * U+2028 and U+2029 go for the mirror reason: they are legal raw inside a JSON string and are
 * LINE TERMINATORS in JavaScript, so a payload carrying one is valid JSON that breaks the
 * moment anything reads the block as script.
 */
export function escapeJson(json: string): string {
  return json.replace(UNSAFE, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Append to `parent` a `<script type="application/json" id="...">` holding `value`. */
export function jsonBlock(dom: Dom<SsrNode>, parent: SsrNode, id: string, value: unknown): void {
  const el = dom.element('script');
  dom.setAttr(el, 'type', 'application/json');
  dom.setAttr(el, 'id', id);
  dom.append(el, dom.text(escapeJson(JSON.stringify(value))));
  dom.append(parent, el);
}
