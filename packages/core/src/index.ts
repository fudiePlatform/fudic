/**
 * Entry point of `@fudic/core`.
 *
 * The client runtime of fudic (SDD-14 §3.3): fine-grained `signal`, the render
 * lifecycle contract, the `FudicElement` base, N2 event delegation, the
 * `<style host>` registry, root bootstrap, and the hydration scheduler.
 * The node contract lives in `@fudic/dom`; the build adapter in `@fudic/ssr`.
 */

export const VERSION = '0.0.1';

export { signal, type Signal } from './signal.js';
export { type SsrBuild, type Render, type RenderFactory } from './render.js';
export { FudicElement } from './element.js';
export { delegate, type Delegate } from './delegate.js';
export { styles, type StyleRegistry } from './styles.js';
export { hydrateRoot, mountRoot } from './bootstrap.js';
export { defineLazy, type HydrationStrategy } from './scheduler.js';
