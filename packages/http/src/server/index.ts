/**
 * `@fudic/http/server`: what serves a server function and runs `load` through its chain. Only
 * the plugin and the adapters import it; never the browser.
 */

export { dispatch, type DispatchOptions, type FnTarget } from './dispatch.js';
export {
  functionsHandler,
  type FnModule,
  type FnSource,
  type FunctionsOptions,
} from './functions.js';
export { pageContext, runLoad, type LoadExport, type PageInput } from './load.js';
export { parseCookies } from './context.js';
export { problemOf, problemResponse, PROBLEM_TYPE } from './problem.js';
export { withRequest } from './request.js';
