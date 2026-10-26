/** The `ctx` of `load` and `layout` (SDD-56 §3.2, §4.4): what a render knows of its URL. */

import type { ServerContext } from '../types.js';
import { serverContext } from './context.js';

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

