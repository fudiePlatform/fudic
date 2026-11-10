/**
 * The client half of `csrf` (SDD-56 §4.11, SDD-81 §3.13).
 *
 * Without parameters, the header a page of another site cannot set: its value is not a token
 * and does not need to be one — a form cannot set a header, and a `fetch` of another site that
 * sets one asks a preflight nobody answers.
 *
 * With `token true`, the header carries the token of the page's `HttpOnly` cookie, asked once at
 * `GET {base}_fudic/csrf` and kept for the life of the page. A `403` with the code `csrfToken`
 * (the cookie expired, the server's secret changed) asks a new one and tries again, once.
 */

import { CSRF_PATH } from '@fudic/conventions';
import { CODE_HEADER, HttpError } from './errors.js';
import type { ClientContext, Next } from './types.js';

export const CSRF_HEADER = 'x-fudic-csrf';

/** The code of a token the server did not take. */
const BAD_TOKEN = 'csrfToken';

/** The token of each origin and base, asked once. */
const tokens = new Map<string, Promise<string>>();

/** Where the page that calls `url` asks its token: its `base`, then `_fudic/csrf`. */
function tokenUrl(url: URL): string {
  const at = url.pathname.indexOf('/_fudic/');
  return `${url.origin}${url.pathname.slice(0, Math.max(at, 0))}${CSRF_PATH}`;
}

/** The token for `url`: the one kept, or a new one when `fresh` or when there is none. */
function token(url: URL, fresh: boolean): Promise<string> {
  const at = tokenUrl(url);
  const kept = fresh ? undefined : tokens.get(at);
  if (kept !== undefined) return kept;
  const asked = fetch(at, { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => {
    if (!response.ok) {
      // The server says why (no secret, another site): that is what the error page shows.
      const said = response.headers.get('content-type')?.includes('json') === true ? ((await response.json()) as { readonly detail?: unknown }) : {};
      const detail = typeof said.detail === 'string' ? said.detail : undefined;
      throw new HttpError({ status: response.status, title: 'CSRF token unavailable', ...(detail !== undefined ? { detail } : {}) });
    }
    return ((await response.json()) as { readonly token: string }).token;
  });
  tokens.set(at, asked);
  // A failed ask is not kept: the next call asks again.
  asked.catch(() => tokens.delete(at));
  return asked;
}

/** Whether the server refused the token: a rejection of a call, or the response of a rule's question. */
function refused(outcome: unknown): boolean {
  if (outcome instanceof HttpError) return outcome.problem.code === BAD_TOKEN;
  return outcome instanceof Response && outcome.status === 403 && outcome.headers.get(CODE_HEADER) === BAD_TOKEN;
}

export const csrfClient = async (
  ctx: ClientContext,
  next: Next<ClientContext>,
  params: { readonly token?: boolean } = {},
): Promise<unknown> => {
  // A `GET` changes nothing and the server does not check it: the plain header is enough.
  if (params.token !== true || ctx.method === 'GET') {
    ctx.headers.set(CSRF_HEADER, '1');
    return next(ctx);
  }
  ctx.headers.set(CSRF_HEADER, await token(ctx.url, false));
  let outcome: unknown;
  try {
    outcome = await next(ctx);
  } catch (error) {
    if (!refused(error)) throw error;
    outcome = error;
  }
  if (!refused(outcome)) return outcome;
  ctx.headers.set(CSRF_HEADER, await token(ctx.url, true));
  return next(ctx);
};
