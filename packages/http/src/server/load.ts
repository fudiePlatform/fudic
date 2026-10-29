/** The `ctx` of `load` and `layout` (SDD-56 §3.2, §4.4): what a render knows of its URL. */

import type { ServerContext } from '../types.js';
import { serverContext, type PendingResponse } from './context.js';

/** What a render already knows about the URL it renders. */
export interface PageInput {
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  /** The request being served; absent in the prerender (§4.14). */
  readonly request?: Request;
  /**
   * Where `load` and `layout` write their status and headers, made by whoever serves the page
   * or its data and applied when it answers (SDD-69 §3.3). Absent: a new one nobody reads.
   */
  readonly response?: PendingResponse;
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
      ...(page.response !== undefined ? { response: page.response } : {}),
    }),
  };
}
