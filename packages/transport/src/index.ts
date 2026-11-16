/**
 * Entry point of `@fudic/transport`.
 *
 * The client shell of fudic (SDD-20): the render lives in the Service Worker, which
 * belongs to no document and therefore owns the `Response` of a navigation from start
 * to finish. Pieces: the manifest (the single route contract), the linker that stands
 * in for the forbidden `import()`, cache access with policy and in-flight dedup, the
 * router with its one synchronous decision, the app's headers and the per-response nonce, the control
 * bus and the main-thread hooks. Runtime dependencies: platform types only.
 */

export const VERSION = '0.0.1';

export {
  type ControlMessage,
  type LocationMessage,
  type RuntimeMessage,
  type WarmMessage,
  type WarmedMessage,
  type InvalidateMessage,
  INVALIDATE_MESSAGE,
  LOCATION_MESSAGE,
  RUNTIME_MESSAGE,
  WARM_MESSAGE,
  WARMED_MESSAGE,
} from './messages.js';
export {
  type RouteMode,
  type CachePolicy,
  type DataPolicy,
  type PagePolicy,
  type RouteRecord,
  type ManifestFile,
  type RouteMatch,
  type RouteTable,
  type HydrateGraph,
  compileManifest,
  hydrateGraphOf,
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
  hydrateNameOf,
} from './urls.js';
export {
  type ModuleExports,
  type Linker,
  type LinkerConfig,
  LinkError,
  canLink,
  LINKER_NEEDS,
  createLinker,
} from './linker.js';
export {
  type CacheNames,
  type Store,
  type StoreConfig,
  STAMP_HEADER,
  BUILD_ID_LENGTH,
  cacheNames,
  createStore,
  isStaleCache,
} from './store.js';
export {
  type RuntimeSweepConfig,
  RUNTIME_MARKER_TTL,
  sweepRuntimeCaches,
} from './runtime-cache.js';
export {
  NONCE_TOKEN,
  applyNonce,
  applyNonceStream,
  newNonce,
} from './csp.js';
export {
  type AssetHeaders,
  type ManifestHeaders,
  type PlaceholderValues,
  PLACEHOLDERS,
  assetDecisionsFor,
  assetHeadersFor,
  fillPlaceholders,
  globMatches,
  orderAssetRules,
  pageHeadersFor,
  wantsNonce,
} from './headers.js';
export {
  type FetchEvent,
  type LayoutResolver,
  type RenderContext,
  type RouteChunk,
  type ResourceRule,
  type Router,
  type RouterConfig,
  type RouterStores,
  createRouter,
} from './router.js';
export { type ControlBus, controlBus } from './control.js';
export { registerRenderServiceWorker, notifyLocation, notifyRuntimeUsed } from './main.js';
