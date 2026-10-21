/**
 * The server half of `csrf` (SDD-56 §4.11): an unsafe call without the header, or from another
 * site, is refused. A module of its own so the client build, which erases `.server(…)`, drops it
 * whole — its text never reaches a client map.
 */

import { CSRF_HEADER } from './csrf-client.js';
import { forbidden } from './errors.js';
import type { ServerStep } from './types.js';

export const csrfServer: ServerStep = (ctx, next) => {
  if (ctx.method !== 'GET') {
    const site = ctx.headers.get('sec-fetch-site');
    const origin = ctx.headers.get('origin');
    if (
      ctx.headers.get(CSRF_HEADER) === null ||
      (site !== null && site !== 'same-origin') ||
      (origin !== null && origin !== ctx.url.origin)
    ) {
      throw forbidden('cross-site request');
    }
  }
  return next(ctx);
};
