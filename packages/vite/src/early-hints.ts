/**
 * The early hints middleware of Node (SDD-73 §3.2): the contract every backend implements over
 * `fudic-routes.json`, in the few lines it takes in any language.
 *
 *     hints = route ? route.hints : manifest.errorHints
 *     a 103 with them, when the request is a navigation over HTTP/2 or later
 *     the final response carries them in `Link`: those of what it painted
 *
 * Nothing here decides anything: the status, a redirect and the error page come out of `load` as
 * ever, and a client that does not understand a `103` ignores it. Pages only: a data endpoint, a
 * server function or a file never call it.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/** A response that may know how to send a `103` (Node's, plain or HTTP/2). */
type HintedResponse = ServerResponse & {
  readonly writeEarlyHints?: (hints: Readonly<Record<string, string | readonly string[]>>) => void;
};

/**
 * What the `103` says besides its `Link`: the policies of the page it announces. A browser
 * checks the preloads of a `103` against the `Content-Security-Policy` that came WITH it, so
 * without one they go out unchecked; the `Referrer-Policy` is the one the requests go with.
 */
export interface EarlyPolicies {
  /** The page's own policy, with the same nonce the final response carries. */
  readonly 'content-security-policy'?: string;
  readonly 'referrer-policy'?: string;
}

/**
 * Whether a `103` is worth sending to `req`: a top-level navigation (`Sec-Fetch-Mode: navigate`)
 * over HTTP/2 or later — what Chrome recommends, and what keeps old HTTP/1.1 clients and proxies,
 * which do not know what to do with a `1xx`, out of it.
 */
export function wantsEarlyHints(req: IncomingMessage): boolean {
  return req.httpVersionMajor >= 2 && req.headers['sec-fetch-mode'] === 'navigate';
}

/**
 * Send the `103` for `req` — once, before anything else is written — when it wants one and the
 * server knows how. Nothing with no hints.
 */
export function sendEarlyHints(
  req: IncomingMessage,
  res: ServerResponse,
  hints: readonly string[],
  policies: EarlyPolicies,
): void {
  const hinted = res as HintedResponse;
  if (hints.length === 0 || !wantsEarlyHints(req) || typeof hinted.writeEarlyHints !== 'function') return;
  hinted.writeEarlyHints({ ...policies, link: hints });
}

/**
 * The `Link` of the final response: the hints of what it painted — the route's, or the error
 * page's when `load` threw, whatever the `103` said. Always, whatever the protocol: a CDN turns
 * it into a `103`, and a browser preloads with it too, later.
 */
export function setLinkHeader(res: ServerResponse, hints: readonly string[]): void {
  if (hints.length > 0) res.setHeader('Link', hints.join(', '));
}
