# @fudic/core

The client runtime of fudic (SDD-14).

- **`signal`** — fine-grained reactivity: value + live subscriber set, explicit
  subscribe/unsubscribe (no automatic tracking in v1), DOM-first rehydration.
- **`Render` / `RenderFactory` / `SsrBuild`** — the lifecycle contract the emit
  produces per block (`create/hydrate/mount/update/remove`). Blocks (`@if`,
  `@foreach`) are the only place where `update` has real work; an N3 component
  is a closure controller `{c, h, r}` produced by the emit (SDD-15 §3.7).
- **`hydrateRoot` / `mountRoot`** — bootstrap for page blocks that are not
  custom elements.

Retired (see SDD-15 §7 and SDD-17 §8): `FudicElement` (superseded by the emit
controller), `defineLazy` / `HydrationStrategy` (hydration is now driven by the
global capturer of SDD-17), `delegate` (per-instance hookup in `s()`), and
`styles` / `StyleRegistry` (v1 inlines `<style>` in the shadow).
