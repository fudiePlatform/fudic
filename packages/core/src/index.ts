/**
 * Entry point of `@fudic/core`.
 *
 * What is left of the client runtime (SDD-14 §3.3) is `signal`, and that is on
 * purpose. The component artifact is emitted, not inherited from here yet: the
 * emit produces a closure controller `{c, h, r}` (SDD-15 §3.7) wrapped by an
 * `FudicElement` base that lands with the emit implementation. Hydration is
 * driven by the global capturer of SDD-17, not by this package.
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

export { signal, type Signal } from './signal.js';
