/**
 * Entry point of `@fudic/transport`.
 *
 * The three-thread client shell of fudic (SDD-16): typed message contract,
 * the WW→SW transport adapter with isolated Safari degradation, the single
 * route→chunk manifest, the WW render server, the SW router (one decision
 * branch: cache hit/miss), the `BroadcastChannel` control bus, and the
 * main-thread SW registration hook. Runtime dependencies: platform types only.
 */

export const VERSION = '0.0.1';

export {
  type ReqId,
  type RenderRequest,
  type RenderMessage,
  type ControlMessage,
  type WorkerPortMessage,
  WORKER_PORT_MESSAGE,
} from './messages.js';
export { canTransferStream, sendRender, receiveRender } from './adapter.js';
export {
  type ManifestEntry,
  type RouteRecord,
  type RouteManifestFile,
  type RouteManifest,
  loadManifest,
} from './manifest.js';
export { type RenderChunk, serveRender, installRenderWorker } from './worker.js';
export {
  type FetchEvent,
  type RenderTarget,
  type Router,
  type RouterConfig,
  createRouter,
} from './router.js';
export { type ControlBus, controlBus } from './control.js';
export { registerRenderServiceWorker, connectRenderWorker } from './main.js';
