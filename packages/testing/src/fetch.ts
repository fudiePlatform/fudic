/**
 * The `fetch` of the environment (§4.6). While it lives, every request the page makes lands
 * here, counted as pending until it answers (§4.7):
 *
 * 1. If the test passed `fetch`, that answers, and nothing else does.
 * 2. A same-origin request under `/_fudic/fn/` goes to the in-memory server, with what a
 *    browser would add to it: the page's cookies, `Origin` and `Sec-Fetch-Site: same-origin`.
 *    The cookies it sets are the page's from then on.
 * 3. One under `/_fudic/data/` — a page asking for its `data` again — runs the route's `load`,
 *    the same way and with the same additions.
 * 4. Anything else is the test's mistake, and it says which URL it was — instead of letting it
 *    out to the network.
 */

import { CSRF_PATH, DATA_PREFIX, FN_PREFIX } from '@fudic/conventions';
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

/**
 * Keep what the response sets, as the page's cookie jar does. Without `HttpOnly` (SDD-69 §4.6):
 * the jar is `document.cookie`, which ignores an `HttpOnly` cookie a script writes, as a
 * browser does — and in a test there is no script to keep the session from, only the next call
 * that has to carry it.
 */
function keepCookies(response: Response): Response {
  for (const cookie of response.headers.getSetCookie()) document.cookie = cookie.replace(/;\s*HttpOnly\s*(?=;|$)/giu, '');
  return response;
}

/** A call to a function the page made, and what it was answered. */
export interface RecordedCall {
  readonly method: string;
  /** Under the app's `base`, query aside: `/_fudic/fn/routes/products/save`. */
  readonly path: string;
  readonly status: number;
}

let recorded: RecordedCall[] | undefined;

/** Start keeping every call to a function from now on; the result reads what was kept. */
export function recordCalls(): () => readonly RecordedCall[] {
  const calls: RecordedCall[] = [];
  recorded = calls;
  return () => calls;
}

async function answer(request: Request): Promise<Response> {
  if (override !== undefined) return override(request);
  const url = new URL(request.url);
  const base = inject(OPTIONS_KEY).base.replace(/\/$/u, '');
  // A function's URL, or the CSRF token's, which the same handler answers (SDD-81 §3.13).
  const fn = url.pathname.startsWith(`${base}${FN_PREFIX}/`) || url.pathname === `${base}${CSRF_PATH}`;
  if (url.origin === location.origin && fn) {
    // Loaded on the first call: most test files never make one, and the setup stays light.
    const { functions } = await import('./server.js');
    // The prefix was just checked, which is the only case in which the handler answers `null`.
    const response = keepCookies((await functions()(asSent(request)))!);
    recorded?.push({ method: request.method, path: url.pathname.slice(base.length), status: response.status });
    return response;
  }
  // The page asking for its `data` again, after a call invalidated it (SDD-68 §4.8).
  if (url.origin === location.origin && url.pathname.startsWith(`${base}${DATA_PREFIX}/`)) {
    const { routeData } = await import('./data.js');
    return keepCookies(await routeData(asSent(request), `${base}${DATA_PREFIX}`));
  }
  throw new TypeError(
    `fetch(${url.href}): a test has no network — answer it with mount's \`fetch\` option, or call a server function`,
  );
}

/**
 * `form` as the bytes of a `multipart/form-data` body (RFC 7578). The page's `FormData` is the
 * DOM environment's and the `Request` is Node's, which does not know it and would send
 * `[object Object]`: the harness writes the body a browser would.
 */
async function multipart(form: FormData): Promise<{ readonly body: Uint8Array<ArrayBuffer>; readonly type: string }> {
  const boundary = `----fudic${crypto.randomUUID().replaceAll('-', '')}`;
  const text = new TextEncoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const quoted = (value: string): string => value.replace(/["\r\n]/gu, (c) => encodeURIComponent(c));
  for (const [name, value] of form.entries()) {
    let head = `--${boundary}\r\ncontent-disposition: form-data; name="${quoted(name)}"`;
    if (typeof value === 'string') {
      chunks.push(text.encode(`${head}\r\n\r\n`), text.encode(value));
    } else {
      // As a browser writes it: a quote or a line break of the name, percent-encoded.
      head += `; filename="${quoted(value.name)}"`;
      chunks.push(text.encode(`${head}\r\ncontent-type: ${value.type || 'application/octet-stream'}\r\n\r\n`));
      chunks.push(new Uint8Array(await value.arrayBuffer()));
    }
    chunks.push(text.encode('\r\n'));
  }
  chunks.push(text.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.length;
  }
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}

/** The request the page meant: a `FormData` body written out as multipart. */
async function requestOf(input: RequestInfo | URL, init?: RequestInit): Promise<Request> {
  if (input instanceof Request) return input;
  const url = new URL(String(input), location.href);
  if (!(init?.body instanceof FormData)) return new Request(url, init);
  const { body, type } = await multipart(init.body);
  const headers = new Headers(init.headers);
  headers.set('content-type', type);
  return new Request(url, { ...init, body, headers });
}

/** The environment's `fetch`: a request in, the answer out, counted as pending meanwhile. */
export function harnessFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return track(requestOf(input, init).then(answer));
}

/** Put the harness's `fetch` in place of the environment's. Once per environment. */
export function installFetch(): void {
  globalThis.fetch = harnessFetch;
  window.fetch = harnessFetch;
  // A call that carries files goes out through `XMLHttpRequest` where there is one (SDD-81
  // §3.4), and happy-dom's would take it to the network. A test has none, so it comes here too.
  for (const scope of [globalThis, window]) {
    Object.defineProperty(scope, 'XMLHttpRequest', { value: undefined, configurable: true, writable: true });
  }
}
