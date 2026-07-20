/**
 * Entry point of `@fudic/core`.
 *
 * What survives of the client runtime (SDD-14 §3.3): fine-grained `signal`, the
 * `Render` lifecycle contract for block renders (`@if` / `@foreach`, where
 * `update` has real work), and the `hydrateRoot` / `mountRoot` bootstrap for
 * page blocks that are not custom elements.
 *
 * The per-component artifact is no longer a base class: the emit produces a
 * closure controller `{c, h, r}` (SDD-15 §3.7), and hydration is driven by the
 * global capturer of SDD-17. `FudicElement`, `defineLazy`, `delegate` and
 * `styles` were retired with those decisions.
 *
 * The node contract lives in `@fudic/dom`; the build adapter in `@fudic/ssr`.
 */

export const VERSION = '0.0.1';

export { signal, type Signal } from './signal.js';
export { type SsrBuild, type Render, type RenderFactory } from './render.js';
export { hydrateRoot, mountRoot } from './bootstrap.js';
