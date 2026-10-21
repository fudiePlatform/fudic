/**
 * `@fudic/http/contract/server`: a function and a `load` of a `.fudapi`, served (SDD-60 §3.3,
 * §4.4). Only the server imports it, never the browser.
 *
 * The dispatcher has matched the URL to a function and read the raw values of the page's
 * params and of its route; this checks each against its type, reads the query by its keys and
 * the body by its declaration, and runs the server halves of the chain into the handler. A
 * function nobody implemented is a 404, as a route that does not exist: in dev its `detail`
 * says what is missing, in a build nothing.
 */

import { createRoot } from '@fudic/di';
import { run } from '../compose.js';
import { HttpError, notFound } from '../errors.js';
import { serverContext } from '../server/context.js';
import { bodyArgs } from '../server/body.js';
import { queryArgs, valueResponse, withForm, type DispatchOptions } from '../server/dispatch.js';
import { problemOf, problemResponse } from '../server/problem.js';
import { withRequest } from '../server/request.js';
import type { ServerContext } from '../types.js';
import type { ServerContract } from './fn.js';
import { compose } from './middleware.js';
import type { PagePiece } from './page.js';
import { conformAll, fromText, type Ty } from './wire.js';

/** What the dispatcher read off the URL. */
export interface ServeInput {
  readonly request: Request;
  readonly contract: ServerContract;
  /** The page's params, as text. */
  readonly page: Readonly<Record<string, string>>;
  /** The params of the function's own route, as text. */
  readonly route: Readonly<Record<string, string>>;
}

/** The 404 of a piece without an implementation: what is missing, only in dev. */
const missing = (what: string, dev: boolean): HttpError => notFound(dev ? what : undefined);

/** The values of a URL by their declared types. */
function typed(types: Readonly<Record<string, Ty>>, read: (name: string) => string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, ty] of Object.entries(types)) {
    const text = read(name);
    if (text !== null) out[name] = fromText(ty, text, `argument ${name}`);
    else if (typeof ty === 'string' || !('opt' in ty)) throw new HttpError({ status: 400, title: 'Bad Request', detail: `argument ${name} is missing` });
  }
  return out;
}

export async function serve(input: ServeInput, options: DispatchOptions = {}): Promise<Response> {
  const { request, contract } = input;
  const { spec } = contract;
  try {
    if (request.method !== spec.method) throw new HttpError({ status: 405, title: 'Method Not Allowed' });
    const handler = contract.slot.get();
    if (handler === undefined) throw missing(contract.slot.missing(), options.dev === true);

    const url = new URL(request.url);
    const params = { ...input.page, ...typed(spec.params ?? {}, (name) => input.route[name] ?? null) };
    const query = typed(spec.query ?? {}, (name) => url.searchParams.get(name));
    const raw = request.method === 'GET' ? queryArgs(url) : await bodyArgs(request, spec.form);
    const args = spec.args !== undefined ? conformAll(spec.args, raw, 'argument') : raw;

    const base = serverContext({ method: spec.method, name: spec.name, url, params: {}, args, request });
    const ctx = Object.assign(base, { params, query }) as unknown as ServerContext;
    const { steps } = compose(spec.chain, 'server');
    const value = await withRequest((options.container ?? createRoot)(), () =>
      run(steps as never, ctx, async (inner: ServerContext) => {
        const done = await withForm(spec.form, inner);
        return (handler as (c: ServerContext) => unknown)(done);
      }),
    );
    return valueResponse(value, ctx);
  } catch (e) {
    if (!(e instanceof HttpError)) options.onError?.(e);
    return problemResponse(problemOf(e, options.dev === true));
  }
}

/**
 * `load` through the server halves of its chain. Without an implementation the page is a 404,
 * with what is missing in `detail` only in dev.
 */
export function runLoad(load: PagePiece<(ctx: never) => unknown>, ctx: ServerContext, dev = false): Promise<unknown> {
  const handler = load.slot.get();
  if (handler === undefined) return Promise.reject(missing(load.slot.missing(), dev));
  const { steps } = compose(load.spec.chain ?? [], 'server');
  return run(steps as never, ctx, (inner: ServerContext) => (handler as (c: ServerContext) => unknown)(inner));
}
