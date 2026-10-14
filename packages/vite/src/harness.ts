/**
 * What `@fudic/testing` paints and serves with (SDD-57), without Vite itself.
 *
 * The harness runs in every worker of a test run, and the main entry of this package is the
 * plugin — which loads Vite, most of a second per worker. These are the pieces `vite dev`
 * renders a route and serves a function with, none of which needs it: the wrapper, the render
 * context and the drain, the table of functions, the routing and the io.
 */

export { emitRenderChunk, type RenderChunkOptions } from './wrapper.js';
export { drainStream, edgeContext, type RenderModule } from './serve.js';
export { devSource, httpFileOf, type DevModules } from './functions.js';
export { discoverRoutes } from './discover.js';
export { resolveOptions, type FudicOptions } from './options.js';
export { nodeIo } from './io.js';
