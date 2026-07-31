/**
 * The elements nobody formats (SDD-26 §4.4).
 *
 * `<script>` is raw by decision 43; `<pre>` and `<textarea>` render their own whitespace.
 * All three are copied byte for byte, indentation included, and they are not reindented
 * even when the element around them changes level: any change inside them alters the
 * program or the render.
 *
 * This is not the display table of §4.5. That one decides where a line MAY break; this one
 * decides where the formatter does not go at all.
 */
export const OPAQUE_ELEMENTS: ReadonlySet<string> = new Set(['script', 'pre', 'textarea']);
