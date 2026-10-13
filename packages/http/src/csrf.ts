/**
 * `csrf` closes the case of a foreign page firing a request with the user's cookies (SDD-56
 * §4.11). A form on another site cannot set a header of its own, and a cross-origin `fetch`
 * with one needs a CORS preflight the server never grants: the header is enough, and there
 * are no tokens to keep or rotate.
 */

import { forbidden } from './errors.js';
import { middleware } from './middleware.js';
import type { Middleware } from './types.js';

export const CSRF_HEADER = 'x-fudic-csrf';

export const csrf: Middleware = /*#__PURE__*/ middleware()
  .client((ctx, next) => {
    ctx.headers.set(CSRF_HEADER, '1');
    return next(ctx);
  })
  .server((ctx, next) => {
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
  });
