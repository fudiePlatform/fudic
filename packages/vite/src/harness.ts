/**
 * What `@fudic/testing` paints and serves with (SDD-57), without Vite itself.
 *
 * The harness runs in every worker of a test run, and the main entry of this package is the
 * plugin — which loads Vite, most of a second per worker. These are the pieces `vite dev`
 * renders a route and serves a function with, none of which needs it: the wrapper, the render
 * context and the drain, the error page, the routing and the io.
 */

export { emitRenderChunk, routeApi, type RenderChunkOptions } from './wrapper.js';
export { drainStream, edgeContext, matchRouteBuild, type RenderModule } from './serve.js';
export { classifyError, renderErrorPage } from './page-errors.js';
export { routeUsesDi } from './client.js';
export { discoverRoutes, type RouteBuild } from './discover.js';
export { resolveOptions, type FudicOptions } from './options.js';
export { nodeIo } from './io.js';
export { ROOT_FILE_PREFIX, SERVER_ROOT_ID } from './api-root.js';
export { API_SCHEME, ApiProject } from './api-modules.js';
export { nodeConfigIo, readProject } from './config.js';
export { idWithoutLocale, pageModuleOf, resolveForLocale, withLocale } from './i18n.js';
