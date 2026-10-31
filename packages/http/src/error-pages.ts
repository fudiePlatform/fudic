/**
 * The client half of `error-pages`: what a call does with an error nobody caught, for the
 * general case (SDD-56 §4.8). The developer puts it in a chain, or does not:
 *
 *     use error-pages
 *       routes  403 /login
 *
 * A status with a route goes there; any other goes to `_error.fud`, by its status alone: the
 * server reads where the user came from off the `Referer`. What it never touches: a cancelled call, and an
 * error the form being sent keeps for itself (`form(…, { catches })`) — that one is the form's
 * to paint.
 *
 * A navigation leaves the call pending forever rather than resolving it: the page is going
 * away, and the code after the `await` would run on a value that never came.
 */

import { ERROR_PREFIX } from '@fudic/conventions';
import { HttpError, Redirect, ValidationError } from './errors.js';
import type { ClientStep } from './types.js';

/** Where a status goes instead of `_error.fud`, by status: `{ 401: '/login' }`. */
export type ErrorRoutes = Readonly<Record<number, string>>;

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

/** Whether the call sent a form that keeps this status: `ctx.args` is the form `form:=` sends. */
function keptByForm(args: unknown, status: number): boolean {
  const form = args as { readonly $catches?: (status: number) => boolean } | null | undefined;
  return typeof form?.$catches === 'function' && form.$catches(status);
}

function navigate(url: string): Promise<never> {
  globalThis.location.assign(url);
  return new Promise<never>(() => {});
}

/**
 * `_error.fud`'s URL for `error`: its status, and nothing else (SDD-73 §3.6). Whatever a URL
 * carries anyone can write in a link, and a `?detail=` painted someone else's sentence with the
 * app's design. Where the user came from travels as the `Referer` the browser sends.
 */
function errorUrl(error: unknown): string {
  return `${ERROR_PREFIX}/${error instanceof HttpError ? error.status : 500}`;
}

/** The client half of `error-pages`, for its routes. */
export function errorPagesStep(routes: ErrorRoutes = {}): ClientStep {
  return async (ctx, next) => {
    try {
      return await next(ctx);
    } catch (e) {
      if (isAbort(e)) throw e;
      if (e instanceof HttpError && keptByForm(ctx.args, e.status)) throw e;
      // A 422 belongs to whoever sent the value it rejects, form or not: there is no page to say it on.
      if (e instanceof ValidationError) throw e;
      if (e instanceof Redirect) return navigate(e.location);
      const route = e instanceof HttpError ? routes[e.status] : undefined;
      if (route !== undefined) return navigate(route);
      return navigate(errorUrl(e));
    }
  };
}
