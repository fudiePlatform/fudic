/**
 * `errorPages`: what a call does with an error nobody caught, for the general case (SDD-56
 * §4.8). A client half only. The developer puts it in a chain, or does not.
 *
 * A navigation leaves the call pending forever rather than resolving it: the page is going
 * away, and the code after the `await` would run on a value that never came.
 */

import { ERROR_PREFIX } from '@fudic/conventions';
import { HttpError, Redirect, ValidationError } from './errors.js';
import { middleware } from './middleware.js';
import type { Middleware } from './types.js';

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

function navigate(url: string): Promise<never> {
  globalThis.location.assign(url);
  return new Promise<never>(() => {});
}

export const errorPages: Middleware = /*#__PURE__*/ middleware().client(async (ctx, next) => {
  try {
    return await next(ctx);
  } catch (e) {
    if (e instanceof ValidationError || isAbort(e)) throw e;
    if (e instanceof Redirect) return navigate(e.location);
    return navigate(`${ERROR_PREFIX}/${e instanceof HttpError ? e.status : 500}`);
  }
});
