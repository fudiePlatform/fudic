/**
 * What serving one server function is made of (SDD-56 §4.6), for the dispatcher of
 * `contract/server.ts`: its options, the arguments of a GET, the validation of a form on a
 * fresh copy, and the response of §4.2.
 */

import type { Container } from '@fudic/di';
import type { AnyForm } from '@fudic/forms';
import { conform } from '../contract/wire.js';
import { badRequest, ValidationError } from '../errors.js';
import type { ServerContext } from '../types.js';
import { markPrivate } from './context.js';
import { fromBase64url } from '../wire/base64url.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';

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

const utf8 = new TextEncoder();

/**
 * The arguments of a GET: `?a=` in the function's format — base64url bytes in `fud-bin`, JSON
 * text with `use json` — or none. The rest carry a body (`body.ts`).
 */
export function queryArgs(url: URL, wire: Wire, types: Readonly<Record<string, Ty>>): Record<string, unknown> {
  const text = url.searchParams.get('a');
  if (text === null || text === '') return {};
  let bytes: Uint8Array;
  try {
    bytes = wire.name === 'fud-bin' ? fromBase64url(text) : utf8.encode(text);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  return wire.decodeArgs(types, bytes);
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

/**
 * The value in the function's format, or 204 when there is none (SDD-67 §4.1, step 6). It is
 * checked against `->` first: a value of another type is the handler's fault, a 500 whose
 * `detail` names the field in dev, and never bytes that lie about their type.
 */
export function valueResponse(value: unknown, ctx: ServerContext, wire: Wire, returns: Ty | undefined): Response {
  markPrivate(ctx.response);
  const { headers } = ctx.response;
  const checked = returns === undefined ? undefined : conformed(returns, value);
  if (checked === undefined) return new Response(null, { status: 204, headers });
  headers.set('content-type', wire.type);
  return new Response(wire.encodeValue(returns!, checked) as BodyInit, { status: ctx.response.status, headers });
}

function conformed(returns: Ty, value: unknown): unknown {
  try {
    return conform(returns, value, 'value');
  } catch (e) {
    throw new Error(`the handler returned a value that is not its ->: ${(e as Error).message}`);
  }
}
