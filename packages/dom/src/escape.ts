/**
 * The escaping of HTML, in one place: the server serializes its tree with it, and the compiler
 * writes the templates the browser clones with it. Two copies would be two chances for the page
 * the server paints and the one the browser creates to differ.
 */

/** Escape for text context: `& < >`. */
export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape for attribute-value context: `& "`. */
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
