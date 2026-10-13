/**
 * The HTML an `@raw(expr)` writes (decision 18): what reaches the content of its element when
 * the value is the author's markup and not text.
 *
 * ONE pure function, and every adapter calls it — the server serializes the string it returns,
 * the browser hands the same string to `innerHTML` — so the two paint the same tree.
 *
 * Opt-out is a mark on the VALUE, never on the call. `@raw` alone does not unescape anything:
 * a value that is not `trustedHtml(…)` is written as text, escaped, exactly as `@expr` would.
 */

/**
 * The mark of trusted HTML. From the global symbol registry for the reason `trustedUrl` uses
 * one: the runtime and the author's bundle may hold two copies of this module, and a mark only
 * one copy recognised would print markup as text in exactly one of them. JSON carries no
 * symbols, so nothing a server or a request hands over is ever marked.
 */
const TRUSTED: unique symbol = Symbol.for('fudic.trustedHtml');

/** HTML the author vouches for: `trustedHtml('<em>hola</em>')`. */
export interface TrustedHTML {
  readonly [TRUSTED]: string;
  /**
   * The HTML again, under a plain name: what the template's types recognise trusted HTML by,
   * since the projection cannot name this module's symbol. Nothing reads it at runtime.
   */
  readonly fudicTrustedHtml: string;
  toString(): string;
}

/** Mark a string as HTML to be written as markup by `@raw`. */
export function trustedHtml(html: string): TrustedHTML {
  return Object.freeze({ [TRUSTED]: html, fudicTrustedHtml: html, toString: () => html });
}

/** Whether `value` was made by `trustedHtml`. */
export function isTrustedHtml(value: unknown): value is TrustedHTML {
  return typeof value === 'object' && value !== null && typeof (value as TrustedHTML)[TRUSTED] === 'string';
}

/**
 * The markup `@raw` writes for `value`: the HTML itself when it is marked, the value as escaped
 * text when it is not, and nothing for `null`/`undefined` (decision 19).
 */
export function htmlOf(value: unknown): string {
  if (isTrustedHtml(value)) return value[TRUSTED];
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
