/**
 * Entry point of `@fudic/core`.
 *
 * Two pieces, and the split is the emit contract (SDD-15 §3.7): the emitted chunk
 * of a component carries only its `static c($props)` factory, which returns a
 * closure controller `{c, h, r}`; the instance scaffolding around it is
 * `FudicElement`, inherited from here. `signal` is the reactivity the factory
 * closes over. Hydration itself — who downloads what, and in which order — is
 * driven by the global capturer of SDD-17, not by this module.
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
