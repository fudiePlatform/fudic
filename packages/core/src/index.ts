/**
 * `@fudic/core`: the reactivity and the component base class a compiled component imports,
 * and the hydration runtime a page loads.
 */

export type { RuntimeEntry } from './runtime-entry.js';

export { FudicElement } from './element.js';
export type { Controller, FudicElementCtor } from './controller.js';
export { signal, type Signal } from './signal.js';
export { computed, type Computed, type Readable } from './computed.js';
export { effect, type Cleanup } from './effect.js';
export { batch } from './batch.js';
export { owned } from './owner.js';
export { onStaleData, type DataSource } from './route-data.js';
export {
  task,
  type Task,
  type TaskState,
  type TaskMode,
  type TaskOptions,
  type Callable,
} from './task.js';
export { untrack } from './tracking.js';
export { now } from './now.js';
export { subscribe, subscribeIf, written } from './subscribe.js';
export {
  strategy,
  type StrategyDecl,
  type RouteMode,
  type CachePolicy,
} from './strategy.js';

export {
  installHydration,
  READY_EVENT,
  HYDRATED_EVENT,
  type Hydration,
  type HydrationOptions,
  type HydratedDetail,
} from './hydrate/install.js';
export { live } from './hydrate/live.js';
export { isCellMark, type CellMark, type CellRef, type Cells } from './hydrate/cells.js';
export type {
  ResolveChunk,
  ImportModule,
  RouteFactory,
  RouteController,
} from './hydrate/chunks.js';
export {
  STATE_BLOCK,
  TREE_BLOCK,
  BUS_BLOCK,
  EAGER_BLOCK,
  ROUTE_BLOCK,
  DATA_BLOCK,
  IOC_BLOCK,
  DI_BLOCK,
  type PageMaps,
  type PartBlock,
  type Settled,
  type TagMap,
} from './hydrate/maps.js';
export { readParts, PART_ATTR, PART_END, type PartsOptions } from './hydrate/parts.js';
export { unpackData, type DataShape, type DataTy } from './hydrate/data.js';
export type { HydratedFrom } from './hydrate/report.js';
export {
  nullWarmChannel,
  WARMED_EVENT,
  type WarmChannel,
  type WarmedDetail,
} from './hydrate/warm/channel.js';
export { createPreloadWarmChannel, type PreloadChannelConfig } from './hydrate/warm/preload.js';
export {
  createServiceWorkerWarmChannel,
  WARM_MESSAGE,
  WARMED_MESSAGE,
  type ServiceWorkerChannelConfig,
  type ServiceWorkerHost,
  type WarmMessage,
  type WarmedMessage,
} from './hydrate/warm/sw.js';
