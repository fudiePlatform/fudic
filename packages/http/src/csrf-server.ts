/**
 * The server half of `csrf` (SDD-56 §4.11, SDD-81 §3.13): an unsafe call without the header, or
 * from another site, is refused; with `token true`, also one whose header is not the token of
 * its cookie. A module of its own so the client build, which erases `.server(…)`, drops it
 * whole — its text never reaches a client map.
 *
 * "Another site" is decided against the URL the request reached, which behind a trusted proxy
 * is the public one (SDD-81 §3.12).
 */

import { fails } from './contract/fails.js';
import { CSRF_HEADER } from './csrf-client.js';
import { checkCsrfToken } from './csrf-token.js';
import type { Next, ServerContext } from './types.js';

/** The failures of `middleware csrf`, as its `.fudapi` declares them. */
const CsrfFails = fails({ crossSite: [403, 'cross-site request'], csrfToken: [403, 'invalid CSRF token'] });

export const csrfServer = async (
  ctx: ServerContext,
  next: Next<ServerContext>,
  params: { readonly token?: boolean } = {},
): Promise<unknown> => {
  if (ctx.method !== 'GET') {
    const header = ctx.headers.get(CSRF_HEADER);
    const site = ctx.headers.get('sec-fetch-site');
    const origin = ctx.headers.get('origin');
    if (header === null || (site !== null && site !== 'same-origin') || (origin !== null && origin !== ctx.url.origin)) {
      throw CsrfFails.crossSite();
    }
    if (params.token === true && (await checkCsrfToken(ctx, header)) === 'bad') throw CsrfFails.csrfToken();
  }
  return next(ctx);
};
