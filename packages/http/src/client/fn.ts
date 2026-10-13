/**
 * `$fn`: what the name of a server function is in the browser (SDD-56 §4.7). The compiler
 * emits one per function, and the developer never writes one.
 *
 * Each call validates a form before anything else, walks the client halves of the chain, and
 * at the end of it sends the request, decodes the answer and invalidates what it changed.
 */

import { levelOfChain, type ChainBuilder } from '../chain.js';
import { compose, run } from '../compose.js';
import { ValidationError } from '../errors.js';
import type { Level } from '../step.js';
import type {
  CallOptions,
  ClientContext,
  CompressOptions,
  Method,
  ServerFunction,
} from '../types.js';
import { decode } from './codec.js';
import { isForm } from './form.js';
import { invalidate } from './invalidate.js';
import { runPipeline, type Stage } from './pipeline.js';
import { KEYED_STAGES } from './stages/index.js';

export { isForm };

/** What the compiler knows of one server function. */
export interface FnSpec {
  /** The exported name: `ctx.name`. */
  readonly name: string;
  readonly method: Method;
  /** Its URL, `base` not included: `/_fudic/fn/r/blog/:slug/save`. */
  readonly url: string;
  /**
   * The pattern of the page a route function belongs to, `base` not included: its params are
   * the page's. Absent for a component's function, whose URL carries none.
   */
  readonly page?: string;
  /** The app's `base`. Default `/`. */
  readonly base?: string;
  /**
   * Its chain, from the outside in: the global `chain()` of `src/http.ts`, the file's level
   * and its own, the last two as the compiler read them.
   */
  readonly chain: readonly (ChainBuilder | Level)[];
  /**
   * How its body travels: `FORM_STAGES` when it declares `.form(…)`, so a form goes without
   * keys; `KEYED_STAGES` (the default) when not, so it never downloads the binary format.
   */
  readonly stages?: readonly Stage[];
  /** Its `.invalidates(…)`, `base` not included. */
  readonly invalidates?: readonly string[];
}

export function $fn<A, R>(spec: FnSpec): ServerFunction<A, R> {
  const base = spec.base ?? '/';
  const levels = spec.chain.map((c) => ('steps' in c ? c : levelOfChain(c)));
  const { steps, compression } = compose(levels, 'client');
  const send = sender(spec.stages ?? KEYED_STAGES, compression);

  const call = async (args?: unknown, options: CallOptions = {}): Promise<unknown> => {
    if (isForm(args) && !(await args.$validate())) {
      throw new ValidationError({
        status: 422,
        title: 'Unprocessable Content',
        errors: args.$errors(),
        summary: args.$summary(),
      });
    }
    const params = options.params ?? pageParams(spec.page, base, globalThis.location.pathname);
    const ctx: ClientContext = {
      side: 'client',
      method: spec.method,
      name: spec.name,
      url: new URL(join(base, fill(spec.url, params)), globalThis.location.origin),
      headers: new Headers(),
      args,
      signal: options.signal ?? new AbortController().signal,
    };
    const value = await run(steps, ctx, send);
    await invalidate(stale(spec, base));
    return value;
  };
  return call as ServerFunction<A, R>;
}

/**
 * The end of the chain: the body through the pipeline, then the request itself. The
 * middlewares never see the encoded body; they saw `ctx.args`.
 */
function sender(
  stages: readonly Stage[],
  compression: CompressOptions | false,
): (ctx: ClientContext) => Promise<unknown> {
  return async (ctx) => {
    const url = new URL(ctx.url);
    const headers = new Headers(ctx.headers);
    let body: BodyInit | undefined;
    if (ctx.method === 'GET') {
      const value = isForm(ctx.args) ? ctx.args.$value() : ctx.args;
      if (value !== undefined) url.searchParams.set('a', JSON.stringify(value));
    } else if (ctx.args !== undefined) {
      const out = await runPipeline(
        stages,
        { value: ctx.args, headers: {} },
        { method: ctx.method, compress: compression },
      );
      for (const [name, value] of Object.entries(out.headers)) headers.set(name, value);
      body = out.value as string | Uint8Array<ArrayBuffer>;
    }
    const response = await fetch(url, {
      method: ctx.method,
      headers,
      signal: ctx.signal,
      credentials: 'same-origin',
      ...(body !== undefined ? { body } : {}),
    });
    return decode(response);
  };
}

/** What a call leaves stale: the page it was made from unless it is a GET, and its own list. */
function stale(spec: FnSpec, base: string): string[] {
  const own = (spec.invalidates ?? []).map((path) => join(base, path));
  return spec.method === 'GET' ? own : [globalThis.location.pathname, ...own];
}

/** The params of `pattern` read off the page the browser is on; none when it is not one. */
export function pageParams(
  pattern: string | undefined,
  base: string,
  pathname: string,
): Record<string, string> {
  if (pattern === undefined) return {};
  const want = join(base, pattern).split('/');
  const have = pathname.split('/');
  const params: Record<string, string> = {};
  if (want.length !== have.length) return params;
  want.forEach((seg, i) => {
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(have[i]!);
  });
  return params;
}

/** `/_fudic/fn/r/blog/:slug/save` with `slug` filled. A param nobody gave is an error. */
export function fill(template: string, params: Readonly<Record<string, string>>): string {
  return template
    .split('/')
    .map((seg) => {
      if (!seg.startsWith(':')) return seg;
      const value = params[seg.slice(1)];
      if (value === undefined) throw new TypeError(`missing param "${seg.slice(1)}" for ${template}`);
      return encodeURIComponent(value);
    })
    .join('/');
}

/** `base` + path, without the double slash a trailing `base` leaves. */
export function join(base: string, path: string): string {
  return `${base}${path}`.replace(/\/{2,}/gu, '/');
}
