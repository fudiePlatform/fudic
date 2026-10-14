/**
 * `dispatch`: from a `Request` to a `Response`, for one server function (SDD-56 §4.6).
 *
 * The container of the request, the `ctx`, the server halves of the chain, the validation of
 * `.form` on a fresh copy, `handle`, and the response of §4.2. Every error becomes the
 * response of §4.6 step 6, so nothing a function throws escapes as a crash of the server.
 */

import { createRoot, type Container } from '@fudic/di';
import type { ServerFn } from '../builder.js';
import { levelOfChain, type ChainBuilder } from '../chain.js';
import { compose, run } from '../compose.js';
import { badRequest, HttpError, ValidationError } from '../errors.js';
import type { Level } from '../step.js';
import type { ServerContext } from '../types.js';
import { bodyArgs } from './body.js';
import { serverContext } from './context.js';
import { problemOf, problemResponse } from './problem.js';
import { withRequest } from './request.js';

/** One server function and what it inherits. */
export interface FnTarget {
  /** Its exported name: what `ctx.name` says. */
  readonly name: string;
  readonly fn: ServerFn<unknown, unknown>;
  /** The default export of `src/http.ts`; absent when the project has none. */
  readonly global?: ChainBuilder;
  /** The file's `export const http`; absent when it writes none. */
  readonly file?: ChainBuilder;
  /** A route function's params, read from its URL. A component's function has none. */
  readonly params: Readonly<Record<string, string>>;
}

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

/** The levels a target inherits, from the outside in. */
export function outerLevels(target: Pick<FnTarget, 'global' | 'file'>): Level[] {
  const levels: Level[] = [];
  if (target.global !== undefined) levels.push(levelOfChain(target.global));
  if (target.file !== undefined) levels.push(levelOfChain(target.file));
  return levels;
}

export async function dispatch(
  request: Request,
  target: FnTarget,
  options: DispatchOptions = {},
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const ctx = serverContext({
      method: target.fn.method,
      name: target.name,
      url,
      params: target.params,
      args: request.method === 'GET' ? queryArgs(url) : await bodyArgs(request, target.fn.form),
      request,
    });
    const { steps } = compose([...outerLevels(target), target.fn.level], 'server');
    const value = await withRequest((options.container ?? createRoot)(), () =>
      run(steps, ctx, async (inner) => target.fn.handle(await withForm(target.fn, inner))),
    );
    return valueResponse(value, ctx);
  } catch (e) {
    if (!(e instanceof HttpError)) options.onError?.(e);
    return problemResponse(problemOf(e, options.dev === true));
  }
}

/** The arguments of a GET: the JSON of `?a=`, or none. The rest carry a body (`body.ts`). */
function queryArgs(url: URL): unknown {
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
async function withForm(fn: ServerFn<unknown, unknown>, ctx: ServerContext): Promise<ServerContext> {
  if (fn.form === undefined) return ctx;
  const copy = fn.form.$fresh();
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
function valueResponse(value: unknown, ctx: ServerContext): Response {
  const { headers } = ctx.response;
  if (value === undefined) return new Response(null, { status: 204, headers });
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { status: ctx.response.status, headers });
}
