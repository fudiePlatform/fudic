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

import { FN_PREFIX } from '@fudic/conventions';
import { createRoot } from '@fudic/di';
import { run } from '../compose.js';
import { HttpError, notFound, type Problem } from '../errors.js';
import { serverContext } from '../server/context.js';
import { bodyArgs } from '../server/body.js';
import { queryArgs, valueResponse, withForm, type DispatchOptions } from '../server/dispatch.js';
import { noFunction, problemOf, problemResponse } from '../server/problem.js';
import { withRequest } from '../server/request.js';
import type { ServerContext } from '../types.js';
import { contractIds, contractsOf, SIG_HEADER, type ServerContract } from './fn.js';
import { compose } from './middleware.js';
import type { PagePiece } from './page.js';
import { checkRules } from './rules.js';
import { conformAll, fromText, unmarked, type Ty } from './wire.js';

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

/** 412: the page was built against another contract (SDD-67 §3.3). */
const stale = (): HttpError =>
  new HttpError({ status: 412, title: 'Precondition Failed', detail: 'the page is older than the server' });

export async function serve(input: ServeInput, options: DispatchOptions = {}): Promise<Response> {
  const { request, contract } = input;
  const { spec } = contract;
  const { wire } = spec;
  // What the handler wrote before it threw still goes out with the error (SDD-69 §4.2).
  let response: ServerContext['response'] | undefined;
  try {
    if (request.method !== spec.method) throw new HttpError({ status: 405, title: 'Method Not Allowed' });
    const handler = contract.slot.get();
    if (handler === undefined) throw missing(contract.slot.missing(), options.dev === true);

    const url = new URL(request.url);
    const params = { ...input.page, ...typed(spec.params ?? {}, (name) => input.route[name] ?? null) };
    const query = typed(spec.query ?? {}, (name) => url.searchParams.get(name));
    if (request.headers.get(SIG_HEADER) !== (spec.sig ?? null)) throw stale();
    const types = spec.args ?? {};
    const raw = request.method === 'GET' ? queryArgs(url, wire, types) : await bodyArgs(request, wire, types);
    const args = spec.form !== undefined ? raw : spec.args !== undefined ? conformAll(spec.args, raw, 'argument') : undefined;
    await checkRules(spec.rules, { ...params, ...query, ...args });

    const base = serverContext({ method: spec.method, name: spec.name, url, params: {}, args, request });
    const ctx = Object.assign(base, { params, query }) as unknown as ServerContext;
    response = ctx.response;
    const { steps } = compose(spec.chain, 'server');
    const value = await withRequest((options.container ?? createRoot)(), () =>
      run(steps as never, ctx, async (inner: ServerContext) => {
        const done = await withForm(spec.form, inner);
        return (handler as (c: ServerContext) => unknown)(done);
      }),
    );
    return valueResponse(value, ctx, wire, spec.returns);
  } catch (e) {
    if (!(e instanceof HttpError)) options.onError?.(e);
    return problemResponse(problemOf(e, options.dev === true), wire, response);
  }
}

export interface ContractsOptions extends DispatchOptions {
  /** The app's `base`. Default `/`. */
  readonly base?: string;
}

/** What a URL names: a function of one `<id>`, and the raw values of the page and its route. */
interface Target {
  readonly contract: ServerContract;
  readonly page: Readonly<Record<string, string>>;
  readonly route: Readonly<Record<string, string>>;
}

/** How many literal segments an `<id>` has: `routes/blog/new` is tried before `routes/blog/[slug]`. */
const literals = (id: string): number => id.split('/').filter((s) => !s.startsWith('[')).length;

/** The params of `pattern` in `parts`, or `undefined` when they do not fit it. */
function fit(pattern: readonly string[], parts: readonly string[], param: (seg: string) => string | undefined): Record<string, string> | undefined {
  if (pattern.length !== parts.length) return undefined;
  const out: Record<string, string> = {};
  for (const [i, seg] of pattern.entries()) {
    const name = param(seg);
    if (name !== undefined) out[name] = decodeURIComponent(parts[i]!);
    else if (seg !== parts[i]) return undefined;
  }
  return out;
}

/** `routes/blog/mi-post/save/42` → `save /:id` of `routes/blog/[slug]`, `slug: 'mi-post'`, `id: '42'`. */
function targetOf(parts: readonly string[]): Target | undefined {
  for (const id of [...contractIds()].sort((a, b) => literals(b) - literals(a))) {
    const segments = id.split('/');
    const page = fit(segments, parts.slice(0, segments.length), (seg) => /^\[(.+)\]$/u.exec(seg)?.[1]);
    if (page === undefined) continue;
    const contract = contractsOf(id).get(parts[segments.length] ?? '');
    if (contract === undefined) continue;
    const route = fit(contract.spec.route ?? [], parts.slice(segments.length + 1), (seg) => (seg.startsWith(':') ? seg.slice(1) : undefined));
    if (route !== undefined) return { contract, page, route };
  }
  return undefined;
}

/**
 * The handler of every function of the `.fudapi` loaded in this process (SDD-60 §4.4): a
 * `Response`, or `null` for a URL outside `/_fudic/fn/`, which belongs to someone else. One
 * under it that names no function of theirs, by `<id>`, name and route, is a 404.
 */
export function contractsHandler(options: ContractsOptions = {}): (request: Request) => Promise<Response | null> {
  const prefix = `${(options.base ?? '/').replace(/\/$/u, '')}${FN_PREFIX}/`;
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(prefix)) return null;
    const target = targetOf(pathname.slice(prefix.length).split('/'));
    if (target === undefined) return noFunction(request);
    return serve({ request, ...target }, options);
  };
}

/**
 * The implementation of `paths` or `layout`, for the prerender and the render. Without one it
 * is an error of the build, as a missing export was.
 */
export function implementation<F>(piece: PagePiece<F>): F {
  const fn = piece.slot.get();
  if (fn === undefined) throw new Error(piece.slot.missing());
  return fn;
}

/**
 * `load` through the server halves of its chain. Without an implementation the page is a 404,
 * with what is missing in `detail` only in dev.
 */
export function runLoad(load: PagePiece<(ctx: never) => unknown>, ctx: ServerContext, dev = false): Promise<unknown> {
  const handler = load.slot.get();
  if (handler === undefined) return Promise.reject(missing(load.slot.missing(), dev));
  const { steps } = compose(load.spec.chain ?? [], 'server');
  const later = load.spec.later ?? [];
  return run(steps as never, ctx, (inner: ServerContext) => (handler as (c: ServerContext) => unknown)(inner))
    .then(unmarked)
    .then((data) => (later.length === 0 ? data : settleLater(data as Record<string, unknown>, later, dev)));
}

/**
 * What a `later` field comes to: its value, or the `Problem` it failed with — and the error
 * itself, for whoever reports it (SDD-70 §3.4).
 */
export type Settled = { readonly ok: unknown } | { readonly error: Problem; readonly cause: unknown };

/**
 * `data` with every `later` field settled, the moment `load` returns (SDD-70 §4.2).
 *
 * Each promise gets its handler HERE, before a byte is painted: one the view never awaits — in
 * the branch of an `@if` that does not render — fails without an unhandled rejection, and
 * nothing waits for it at the end. What the page awaits never rejects: a failure is a
 * `Problem` by the rule of `problemOf` (an `HttpError` keeps its status, anything else is a
 * `500`, `detail` only in dev). A redirect lands there too, and in dev says it cannot be
 * followed: the response is already a `200`.
 */
export function settleLater(data: Record<string, unknown>, later: readonly string[], dev: boolean): Record<string, unknown> {
  const out = { ...data };
  for (const name of later) {
    out[name] = Promise.resolve(data[name]).then(
      (ok): Settled => ({ ok }),
      (cause: unknown): Settled => {
        const error = problemOf(cause, dev);
        if (dev && error.status >= 300 && error.status < 400) {
          console.warn(`fudic: the later field "${name}" redirected after the first byte; the page cannot follow it.`);
        }
        return { error, cause };
      },
    );
  }
  return out;
}
