/**
 * What the server tells the code that runs under it (SDD-81 §3.11, §3.13): the default `Secure`
 * of a cookie, and what the CSRF token is signed with.
 *
 * It travels on `ctx.response`, under a registered symbol, as the session note of SDD-69 does:
 * `ctx` is spread by every step of a chain and `response` is the one object handed on intact,
 * and the server that writes it (`@fudic/server`, or `serve` here) may be another copy of this
 * package than the one inside the app's chunks.
 */

const SETTINGS = Symbol.for('fudic.serverSettings');

export interface ServerSettings {
  /** The default `Secure` of every cookie. */
  readonly secureCookies: boolean;
  /** What the CSRF token is signed with, when the server has it. */
  readonly secret?: string;
}

/** Production's: `Secure` cookies and no secret. What a response nobody settled reads. */
const DEFAULTS: ServerSettings = { secureCookies: true };

/** `settings` on `response`, for whoever reads them later. */
export function settle(response: object, settings: ServerSettings): void {
  Object.defineProperty(response, SETTINGS, { value: settings, configurable: true });
}

/** What the server said on `response`, or production's defaults. */
export function serverSettings(response: object): ServerSettings {
  return (response as { readonly [SETTINGS]?: ServerSettings })[SETTINGS] ?? DEFAULTS;
}
