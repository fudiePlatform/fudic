/**
 * The `fetch` of the environment (§4.6). While it lives, every request the page makes lands
 * here, counted as pending until it answers (§4.7):
 *
 * 1. If the test passed `fetch`, that answers, and nothing else does.
 * 2. A same-origin request under `/_fudic/fn/` goes to the in-memory server, with what a
 *    browser would add to it: the page's cookies, `Origin` and `Sec-Fetch-Site: same-origin`.
 *    The cookies it sets are the page's from then on.
 * 3. Anything else is the test's mistake, and it says which URL it was — instead of letting it
 *    out to the network.
 */

import { FN_PREFIX } from '@fudic/conventions';
import { inject } from 'vitest';
import { OPTIONS_KEY } from './constants.js';
import { track } from './pending.js';

/** What a test answers its requests with, in place of the in-memory server. */
export type FetchOverride = (request: Request) => Response | Promise<Response>;

let override: FetchOverride | undefined;

/** Answer this test's requests with `fn`, or with the in-memory server when `undefined`. */
export function answerWith(fn: FetchOverride | undefined): void {
  override = fn;
}

/** The request as a browser on this page sends it to its own origin. */
function asSent(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set('origin', location.origin);
  headers.set('sec-fetch-site', 'same-origin');
  if (document.cookie !== '') headers.set('cookie', document.cookie);
  return new Request(request, { headers });
}

/** Empty the page's cookie jar: what one test's server set is not the next test's (§4.8). */
export function forgetCookies(): void {
  for (const pair of document.cookie.split('; ').filter(Boolean)) {
    document.cookie = `${pair.split('=')[0]!}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/** Keep what the response sets, as the page's cookie jar does. */
function keepCookies(response: Response): Response {
  for (const cookie of response.headers.getSetCookie()) document.cookie = cookie;
  return response;
}

async function answer(request: Request): Promise<Response> {
  if (override !== undefined) return override(request);
  const url = new URL(request.url);
  const base = inject(OPTIONS_KEY).base.replace(/\/$/u, '');
  if (url.origin === location.origin && url.pathname.startsWith(`${base}${FN_PREFIX}/`)) {
    // Loaded on the first call: most test files never make one, and the setup stays light.
    const { functions } = await import('./server.js');
    // The prefix was just checked, which is the only case in which the handler answers `null`.
    return keepCookies((await functions()(asSent(request)))!);
  }
  throw new TypeError(
    `fetch(${url.href}): a test has no network — answer it with mount's \`fetch\` option, or call a server function`,
  );
}

/** The environment's `fetch`: a request in, the answer out, counted as pending meanwhile. */
export function harnessFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : new Request(new URL(String(input), location.href), init);
  return track(answer(request));
}

/** Put the harness's `fetch` in place of the environment's. Once per environment. */
export function installFetch(): void {
  globalThis.fetch = harnessFetch;
  window.fetch = harnessFetch;
}
