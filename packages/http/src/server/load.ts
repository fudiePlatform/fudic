/**
 * `load` through the chain (SDD-56 §3.2, §4.4): the server halves of the global and the file
 * levels, plus its own when it is written fluent. Never a client half: the request of `load`
 * is made by the browser navigating or by the Service Worker, never by the user's code.
 */

import type { ServerFn } from '../builder.js';
import { compose, run } from '../compose.js';
import type { ServerContext } from '../types.js';
import { serverContext } from './context.js';
import { outerLevels, type FnTarget } from './dispatch.js';

/** What a render already knows about the URL it renders. */
export interface PageInput {
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  /** The request being served; absent in the prerender (§4.14). */
  readonly request?: Request;
}

/** The `ctx` of `load` and `layout`: what the render had, plus the server context of a GET. */
export function pageContext<C extends PageInput>(page: C): C & ServerContext {
  return {
    ...page,
    ...serverContext({
      method: 'GET',
      name: 'load',
      url: page.url,
      params: page.params,
      args: undefined,
      ...(page.request !== undefined ? { request: page.request } : {}),
    }),
  };
}

/** `export async function load(ctx)` or `export const load = get()…handle(…)`. */
export type LoadExport = ((ctx: ServerContext) => unknown) | ServerFn<unknown, unknown>;

export function runLoad(
  load: LoadExport,
  outer: Pick<FnTarget, 'global' | 'file'>,
  ctx: ServerContext,
): Promise<unknown> {
  const fluent = typeof load === 'function' ? undefined : load;
  const levels = [...outerLevels(outer), ...(fluent !== undefined ? [fluent.level] : [])];
  const { steps } = compose(levels, 'server');
  return run(steps, ctx, (inner) =>
    fluent !== undefined ? fluent.handle(inner) : (load as (ctx: ServerContext) => unknown)(inner),
  );
}
