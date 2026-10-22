/**
 * A function of a `.fudapi` (SDD-60 §3.3, §3.11): one declaration, two variants of the same
 * name. On the server it is the contract `.handle(fn)` completes; in the browser, the call
 * itself, which splits its one argument into route, query and body, checks every value against
 * its type and sends it through the client halves of its chain.
 *
 * Its URL is `/_fudic/fn/<id>/<name><route>`, the parameters of the page in `<id>` and those of
 * its own route filled with their values: `save /:id` of `routes/blog/[slug]` is
 * `/_fudic/fn/routes/blog/mi-post/save/42`.
 */

import type { AnyForm } from '@fudic/forms';
import { Slot } from '@fudic/forms/contract';
import { FN_PREFIX } from '@fudic/conventions';
import { decode } from '../client/codec.js';
import { join, pageParams } from '../client/fn.js';
import { isForm } from '../client/form.js';
import { invalidate } from '../client/invalidate.js';
import { runPipeline } from '../client/pipeline.js';
import { FORM_STAGES, KEYED_STAGES } from '../client/stages/index.js';
import { run } from '../compose.js';
import { ValidationError } from '../errors.js';
import type { CallOptions, ClientContext, Method, ServerContext, ServerFunction } from '../types.js';
import { compose, type Level } from './middleware.js';
import { conformAll, toText, type Ty } from './wire.js';

export interface FnSpec {
  /** `<id>` of its `.fudapi`: `routes/blog/[slug]`. */
  readonly id: string;
  readonly name: string;
  readonly method: Method;
  /** The pattern of the page when the file is a route's sibling: `/blog/:slug`. */
  readonly page?: string;
  /** Its own route: `['lines', ':line']`. */
  readonly route?: readonly string[];
  /** The arguments of its route, by name. */
  readonly params?: Readonly<Record<string, Ty>>;
  /** Its `query` arguments. */
  readonly query?: Readonly<Record<string, Ty>>;
  /** The arguments of its body; absent when it has none or takes a form. */
  readonly args?: Readonly<Record<string, Ty>>;
  /** Its `form`: the server validates a fresh copy of it. */
  readonly form?: AnyForm;
  /** Global, file and its own level, from the outside in. */
  readonly chain: readonly Level[];
  readonly invalidates?: readonly string[];
  /** The app's `base`. Default `/`. */
  readonly base?: string;
}

/** The `ctx` of a handler: params of the page and the route, typed, and its query. */
export type FnContext<P, Q, A> = Omit<ServerContext<A>, 'params'> & { readonly params: P; readonly query: Q };

/** The `ctx` of a handler of a function with `form`. */
export type FormContext<P, Q, F> = FnContext<P, Q, undefined> & { readonly form: F };

/** What a handler is given and returns. */
export type Handler<C, R> = (ctx: C) => R | Promise<R>;

/** The name of a function, on both sides: what the browser calls, what `src/server` completes. */
export interface Contract<C, R, A = void> extends ServerFunction<A, R> {
  /** Registers the handler. Returns nothing. */
  handle(fn: Handler<C, R>): void;
}

/** The server variant, as the dispatcher reads it. */
export interface ServerContract extends Contract<never, unknown, unknown> {
  readonly spec: FnSpec;
  readonly slot: Slot<Handler<never, unknown>>;
}

const contracts = new Map<string, Map<string, ServerContract>>();

/** The functions of one `<id>`, by name: what the dispatcher looks up. */
export const contractsOf = (id: string): ReadonlyMap<string, ServerContract> => contracts.get(id) ?? new Map();

/** Every `<id>` with a function loaded in this process: what the dispatcher matches a URL against. */
export const contractIds = (): readonly string[] => [...contracts.keys()];

const labelOf = (spec: FnSpec): string => `${spec.name} of ${spec.id}`;

/** The server variant: the contract `src/server` completes with `.handle`. */
export function fn(spec: FnSpec): ServerContract {
  const slot = new Slot<Handler<never, unknown>>(labelOf(spec), 'server');
  const call = (): Promise<never> => Promise.reject(new Error(`${labelOf(spec)} is called from the browser`));
  const contract = Object.assign(call, { spec, slot, handle: (h: Handler<never, unknown>) => slot.set(h) });
  const byName = contracts.get(spec.id) ?? new Map<string, ServerContract>();
  contracts.set(spec.id, byName);
  byName.set(spec.name, contract as unknown as ServerContract);
  return contract as unknown as ServerContract;
}

/** Whether a call splits its argument: a form alone travels as today, `save(form)`. */
const places = (spec: FnSpec): boolean => Object.keys({ ...spec.params, ...spec.query }).length > 0;

/** The browser variant: the call. `.handle` here is always the wrong folder. */
export function stub<C, R, A>(spec: FnSpec): Contract<C, R, A> {
  const slot = new Slot<unknown>(labelOf(spec), 'server', true);
  const base = spec.base ?? '/';
  const { steps, compression } = compose(spec.chain, 'client');
  const stages = spec.form !== undefined ? FORM_STAGES : KEYED_STAGES;

  const call = async (input?: unknown, options: CallOptions = {}): Promise<unknown> => {
    const record = (input ?? {}) as Readonly<Record<string, unknown>>;
    const form = spec.form === undefined ? undefined : places(spec) ? record['form'] : input;
    if (isForm(form) && !(await form.$validate())) {
      throw new ValidationError({ status: 422, title: 'Unprocessable Content', errors: form.$errors(), summary: form.$summary() });
    }
    const route = conformAll(spec.params ?? {}, record, 'argument');
    const query = conformAll(spec.query ?? {}, record, 'argument');
    const args = spec.form !== undefined ? form : spec.args !== undefined ? conformAll(spec.args, record, 'argument') : undefined;

    const page = options.params ?? pageParams(spec.page, base, globalThis.location.pathname);
    const url = new URL(join(base, pathOf(spec, page, route)), globalThis.location.origin);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, toText(value));

    const ctx: ClientContext = {
      side: 'client',
      method: spec.method,
      name: spec.name,
      url,
      headers: new Headers(),
      args,
      signal: options.signal ?? new AbortController().signal,
    };
    const value = await run(steps as never, ctx, async (c: ClientContext) => {
      const target = new URL(c.url);
      const headers = new Headers(c.headers);
      let body: BodyInit | undefined;
      if (c.method === 'GET') {
        const sent = isForm(c.args) ? c.args.$value() : c.args;
        if (sent !== undefined) target.searchParams.set('a', JSON.stringify(sent));
      } else if (c.args !== undefined) {
        const out = await runPipeline(stages, { value: c.args, headers: {} }, { method: c.method, compress: compression });
        for (const [name, v] of Object.entries(out.headers)) headers.set(name, v);
        body = out.value as string | Uint8Array<ArrayBuffer>;
      }
      const response = await fetch(target, {
        method: c.method,
        headers,
        signal: c.signal,
        credentials: 'same-origin',
        ...(body !== undefined ? { body } : {}),
      });
      return decode(response);
    });
    const own = (spec.invalidates ?? []).map((path) => join(base, path));
    await invalidate(spec.method === 'GET' ? own : [globalThis.location.pathname, ...own]);
    return value;
  };
  return Object.assign(call, { handle: (h: unknown) => slot.set(h) }) as unknown as Contract<C, R, A>;
}

/** `/_fudic/fn/<id with the page's values>/<name>/<route with its values>`. */
export function pathOf(
  spec: Pick<FnSpec, 'id' | 'name' | 'route'>,
  page: Readonly<Record<string, string>>,
  route: Readonly<Record<string, unknown>>,
): string {
  const id = spec.id.split('/').map((seg) => {
    const param = /^\[(.+)\]$/u.exec(seg)?.[1];
    return param === undefined ? seg : encodeURIComponent(page[param] ?? '');
  });
  const own = (spec.route ?? []).map((seg) => (seg.startsWith(':') ? encodeURIComponent(toText(route[seg.slice(1)])) : seg));
  return [FN_PREFIX, ...id, spec.name, ...own].join('/');
}
