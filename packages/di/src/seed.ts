/**
 * What one page publishes for the other side to rebuild its services from.
 *
 * The table hangs off the ROOT CONTAINER, which is one request on the server and one page in
 * the browser. That is the whole design and it is not a detail of implementation: a table
 * held by the module would be shared by every response the process renders, and a server
 * answering two visitors at once would paint one of them with the other's values — silently,
 * because both pages are perfectly well-formed. Whoever publishes has to say into WHICH page,
 * and the container is the only thing that answers that question.
 */

import { ambientContainer } from './ambient.js';
import { rootOf, state } from './container.js';
import type { Container, Token } from './types.js';

/**
 * Publish a value under a token, for the page `container` belongs to.
 *
 * Any container of the page will do — the value goes to the root, which is where a resolution
 * looks for it — so a component publishes through the container it holds and never has to be
 * handed the root.
 */
export function publishIn<T>(container: Container, token: Token<T>, value: T): void {
  rootOf(state(container)).seed[token.name] = value;
}

/**
 * Publish into the page of the request being served (SDD-56 §3.8): the same as `publishIn`
 * with the request's root, which the server runtime keeps per request, so two concurrent
 * responses still write into two tables.
 */
export function publish<T>(token: Token<T>, value: T): void {
  const request = ambientContainer();
  if (request === undefined) {
    throw new Error(`publish(${token.name}) outside a request: there is no ambient container`);
  }
  publishIn(request, token, value);
}

/** What this page has published, by token name. Empty when nothing has. */
export function seedOf(container: Container): Readonly<Record<string, unknown>> {
  return rootOf(state(container)).seed;
}
