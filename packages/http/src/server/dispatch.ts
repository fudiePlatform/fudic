/**
 * What serving one server function is made of (SDD-56 §4.6), for the dispatcher of
 * `contract/server.ts`: its options, the arguments of a GET, the validation of a form on a
 * fresh copy, and the response of §4.2.
 */

import type { Container } from '@fudic/di';
import type { AnyForm } from '@fudic/forms';
import { badRequest, ValidationError } from '../errors.js';
import type { ServerContext } from '../types.js';

export interface DispatchOptions {
  /** Dev: a 500 carries its message in `detail`. Never in a build. */
  readonly dev?: boolean;
  /** Told about every error that is not an `HttpError`: in dev, the overlay. */
  readonly onError?: (error: unknown) => void;
  /**
   * The container this request resolves from, made fresh for each one. Default: a new root.
   * `@fudic/testing` hands one with the test's services in it (SDD-57).
   */
  readonly container?: () => Container;
}

/** The arguments of a GET: the JSON of `?a=`, or none. The rest carry a body (`body.ts`). */
export function queryArgs(url: URL): unknown {
  const text = url.searchParams.get('a');
  if (text === null || text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest('the arguments are not valid JSON');
  }
}

/**
 * `.form(f)`, just before `handle` (§4.6, step 4): a fresh copy per request, assigned and
 * validated with the server's rules. What does not fit the schema is a 400; what does not
 * validate, a 422 with the form's errors.
 */
export async function withForm(form: AnyForm | undefined, ctx: ServerContext): Promise<ServerContext> {
  if (form === undefined) return ctx;
  const copy = form.$fresh();
  try {
    copy.$set(ctx.args as never);
  } catch (e) {
    // `$set` only throws its own `TypeError` / `RangeError`, naming what does not fit.
    throw badRequest((e as Error).message);
  }
  if (!(await copy.$validate({ server: true }))) {
    throw new ValidationError({
      status: 422,
      title: 'Unprocessable Content',
      errors: copy.$errors(),
      summary: copy.$summary(),
    });
  }
  return Object.assign(ctx, { form: copy });
}

/** 200 with the JSON of the value, or 204 when there is none (§4.2). */
export function valueResponse(value: unknown, ctx: ServerContext): Response {
  const { headers } = ctx.response;
  if (value === undefined) return new Response(null, { status: 204, headers });
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { status: ctx.response.status, headers });
}
