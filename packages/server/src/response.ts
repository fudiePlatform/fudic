/**
 * The response `load`, `layout` and a function write their status and headers to (SDD-69 §3.3),
 * and what the server tells them through it (SDD-81 §3.11).
 *
 * Read and written BY SHAPE, under registered symbols: the code that writes the note is the
 * copy of `@fudic/http` inside the app's own chunks, not one this package imports.
 */

import type { PendingResponse } from './render.js';

/** The note `@fudic/http` leaves when a context read the session. */
const SESSION_READ = Symbol.for('fudic.sessionRead');

/** What the server settles for the code that runs under it (`@fudic/http`'s `serverSettings`). */
const SETTINGS = Symbol.for('fudic.serverSettings');

/** What the code that runs under this server is told. */
export interface ServerSettings {
  /** The default `Secure` of every cookie (SDD-81 §3.11). */
  readonly secureCookies: boolean;
  /** What the CSRF token is signed with (SDD-81 §3.13), when there is one. */
  readonly secret?: string;
}

/** A fresh one, for one render or one data request, carrying the server's settings. */
export function pendingResponse(settings: ServerSettings): PendingResponse {
  const response: PendingResponse = { status: 200, headers: new Headers() };
  Object.defineProperty(response, SETTINGS, { value: settings });
  return response;
}

/**
 * Whether `load` or `layout` read the session on `response` (SDD-69 §4.4). The route's wrapper
 * marks such a response private itself; the prerender asks, to refuse the page.
 */
export function readsSession(response: PendingResponse): boolean {
  return (response as { readonly [key: symbol]: unknown })[SESSION_READ] === true;
}
