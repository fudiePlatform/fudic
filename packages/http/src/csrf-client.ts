/** The client half of `csrf` (SDD-56 §4.11): the header a page of another site cannot set. */

import type { ClientStep } from './types.js';

export const CSRF_HEADER = 'x-fudic-csrf';

export const csrfClient: ClientStep = (ctx, next) => {
  ctx.headers.set(CSRF_HEADER, '1');
  return next(ctx);
};
