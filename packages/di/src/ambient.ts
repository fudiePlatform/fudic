/**
 * The request's container, for `inject()` and `publish()` written without one (SDD-56 §3.8).
 *
 * The server runtime installs the source once — an `AsyncLocalStorage` read, in
 * `@fudic/http/server` — and from then on every call made while a request is being served
 * finds that request's root, across any `await`. This package never imports `node:*`: it only
 * holds the hook, and whoever has a store hands it over.
 *
 * Nothing installs it in the browser. There, a component's `inject(…)` is rewritten to
 * `injectFrom($ioc, …)` by the compiler and never reaches this.
 */

import type { Container } from './types.js';

let source: (() => Container | undefined) | null = null;

/** The hook the server runtime installs, never the user. */
export function setAmbient(next: () => Container | undefined): void {
  source = next;
}

/** The container of the request being served, or `undefined` outside one. */
export function ambientContainer(): Container | undefined {
  return source?.();
}
