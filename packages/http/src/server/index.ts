/**
 * `@fudic/http/server`: what a render runs `load` and `layout` inside of. Only the plugin and the
 * adapters import it; never the browser. Serving the functions is `./contract/server`'s.
 */

export type { DispatchOptions } from './dispatch.js';
export { pageContext, type PageInput } from './load.js';
export { markPrivate, parseCookies, readsSession, type PendingResponse } from './context.js';
export { noFunction, problemOf, problemResponse, PROBLEM_TYPE } from './problem.js';
export { withRequest } from './request.js';
