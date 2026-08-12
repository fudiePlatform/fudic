/**
 * Entry point of `@fudic/core`.
 *
 * The package has two faces, and they are downloaded by different people. The
 * emitted chunk of a component carries only its `static c($props)` factory, which
 * returns a closure controller `{c, h, u, r}`; the instance scaffolding around it is
 * `FudicElement`, inherited from here, and `signal` is the reactivity the factory
 * closes over (SDD-15 §3.7). The other face is `installHydration` — the global
 * capturer of SDD-17: the ONE module the PAGE downloads on the initial load, which
 * decides who is downloaded, when, and in which order. A component's chunk imports
 * the first; the page's bootstrap imports the second.
 *
 * `Render`/`RenderFactory`/`SsrBuild` and the `hydrateRoot`/`mountRoot` bootstrap
 * were removed rather than kept: they were the SDD-14 *component* lifecycle, and
 * relabelling them as the block contract left a shape that contradicts the emit
 * (`mount` vs `m`, `Cursor` vs baked positional traversal, `DomClient`-only
 * factories vs one controller on two adapters). The block render contract will
 * come from the SDD that owns `@if` / `@foreach` emission.
 *
 * The node contract lives in `@fudic/dom`; the build adapter in `@fudic/ssr`.
 */

export const VERSION = '0.0.1';

export { FudicElement } from './element.js';
export type { Controller, FudicElementCtor } from './controller.js';
export { signal, type Signal } from './signal.js';
export { computed, type Computed, type Readable } from './computed.js';
export { effect, type Cleanup } from './effect.js';
export { batch } from './batch.js';
export { untrack } from './tracking.js';
export { subscribe } from './subscribe.js';
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
  type HydrationOptions,
  type HydratedDetail,
} from './hydrate/install.js';
export type { ResolveChunk, ImportModule } from './hydrate/chunks.js';
export type { HydratedFrom } from './hydrate/registry.js';
export { nullWarmChannel, type WarmChannel } from './hydrate/warm/channel.js';
