/**
 * From a request under `/_fudic/fn` to the server function it names (SDD-56 §4.1, §4.15).
 *
 * The URL says whose function it is — `r/<the page's path>/<name>` for a route, with the
 * page's params filled in, or `c/<tag>/<name>` for a component — and the source says where its
 * `?server` module is. One function for the three places that serve them: the dev server
 * (modules loaded on demand), `functions.mjs` (modules bundled by the build) and whatever
 * adapter mounts that file.
 */

import { FN_PREFIX } from '@fudic/conventions';
import type { ServerFn } from '../builder.js';
import type { ChainBuilder } from '../chain.js';
import { HttpError } from '../errors.js';
import { dispatch, type DispatchOptions } from './dispatch.js';
import { problemResponse } from './problem.js';

/** The exports of a `?server` module, as the router reads them. */
export type FnModule = Readonly<Record<string, unknown>> & { readonly http?: ChainBuilder };

/** Where the modules are. Each lookup answers `undefined` for a file that does not exist. */
export interface FnSource {
  /** The route patterns of the app: `/blog/:slug`. */
  readonly routes: readonly string[];
  route(pattern: string): Promise<FnModule | undefined>;
  component(tag: string): Promise<FnModule | undefined>;
  /** The default export of `src/http.ts`, or `undefined` without one. */
  global(): Promise<ChainBuilder | undefined>;
}

export interface FunctionsOptions extends DispatchOptions {
  /** The app's `base`. Default `/`. */
  readonly base?: string;
}

/** What a request names: whose module, and which export. */
type Target =
  | { readonly kind: 'route'; readonly pattern: string; readonly params: Record<string, string>; readonly name: string }
  | { readonly kind: 'component'; readonly tag: string; readonly name: string };

const notFound = (): Response =>
  problemResponse({ status: 404, title: 'Not Found', detail: 'no such server function' });

/** Whether an export is a server function: what `.handle(…)` returns. */
function isServerFn(value: unknown): value is ServerFn<unknown, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { handle?: unknown }).handle === 'function' &&
    typeof (value as { method?: unknown }).method === 'string'
  );
}

/**
 * The handler of every server function of an app: a `Response`, or `null` for a request that
 * is not under `/_fudic/fn` and belongs to someone else.
 */
export function functionsHandler(
  source: FnSource,
  options: FunctionsOptions = {},
): (request: Request) => Promise<Response | null> {
  const prefix = `${(options.base ?? '/').replace(/\/$/u, '')}${FN_PREFIX}/`;
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(prefix)) return null;
    const target = targetOf(pathname.slice(prefix.length).split('/'), source.routes);
    if (target === undefined || target.name === 'load') return notFound();

    const mod = target.kind === 'route' ? await source.route(target.pattern) : await source.component(target.tag);
    const fn = mod?.[target.name];
    if (!isServerFn(fn)) return notFound();
    if (fn.method !== request.method) {
      return problemResponse(new HttpError({ status: 405, title: 'Method Not Allowed' }).problem);
    }
    const global = await source.global();
    return dispatch(
      request,
      {
        name: target.name,
        fn,
        params: target.kind === 'route' ? target.params : {},
        ...(global !== undefined ? { global } : {}),
        ...(mod!.http !== undefined ? { file: mod!.http } : {}),
      },
      options,
    );
  };
}

/** `['r', 'blog', 'a', 'save']` → the route `/blog/:slug` with `slug: 'a'`, function `save`. */
function targetOf(segments: readonly string[], routes: readonly string[]): Target | undefined {
  const [kind, ...rest] = segments;
  const name = rest[rest.length - 1];
  if (name === undefined || name === '') return undefined;
  if (kind === 'c') {
    return rest.length === 2 ? { kind: 'component', tag: rest[0]!, name } : undefined;
  }
  if (kind !== 'r') return undefined;
  const parts = rest.slice(0, -1);
  for (const pattern of routes) {
    const params = match(pattern, parts);
    if (params !== undefined) return { kind: 'route', pattern, params, name };
  }
  return undefined;
}

/** The params of `pattern` in a concrete path, or `undefined` when it is not one of its URLs. */
function match(pattern: string, parts: readonly string[]): Record<string, string> | undefined {
  const want = pattern.split('/').filter((s) => s !== '');
  if (want.length !== parts.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i += 1) {
    const seg = want[i]!;
    const part = parts[i]!;
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(part);
    else if (seg !== part) return undefined;
  }
  return params;
}
