/**
 * Entry point of `@fudic/transport`.
 *
 * The client shell of fudic (SDD-20): the render lives in the Service Worker, which
 * belongs to no document and therefore owns the `Response` of a navigation from start
 * to finish. Pieces: the manifest (the single route contract), the linker that stands
 * in for the forbidden `import()`, cache access with policy and in-flight dedup, the
 * router with its one synchronous decision, CSP with a per-response nonce, the control
 * bus and the main-thread hooks. Runtime dependencies: platform types only.
 */

export const VERSION = '0.0.1';

export {
  type ControlMessage,
  type LocationMessage,
  LOCATION_MESSAGE,
} from './messages.js';
export {
  type RouteMode,
  type CachePolicy,
  type DataPolicy,
  type PagePolicy,
  type RouteRecord,
  type CspTemplates,
  type ManifestFile,
  type RouteMatch,
  type RouteTable,
  compileManifest,
  loadManifest,
  fillParams,
  segmentsOf,
  safeName,
} from './manifest.js';
export {
  type UrlResolver,
  DATA_PREFIX,
  LINK_DIR,
  CLIENT_DIR,
  createUrlResolver,
} from './urls.js';
export {
  type ModuleExports,
  type Linker,
  type LinkerConfig,
  LinkError,
  canLink,
  createLinker,
} from './linker.js';
export {
  type CacheNames,
  type Store,
  type StoreConfig,
  STAMP_HEADER,
  cacheNames,
  createStore,
  isStaleCache,
} from './store.js';
export {
  NONCE_TOKEN,
  DEFAULT_CSP,
  applyNonce,
  applyNonceStream,
  cspFor,
  newNonce,
} from './csp.js';
export {
  type FetchEvent,
  type RenderContext,
  type RouteChunk,
  type ResourceRule,
  type Router,
  type RouterConfig,
  type RouterStores,
  createRouter,
} from './router.js';
export { type ControlBus, controlBus } from './control.js';
export { registerRenderServiceWorker, notifyLocation } from './main.js';
