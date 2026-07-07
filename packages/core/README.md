# @fudic/core

The client runtime of fudic (SDD-14).

- **`signal`** — fine-grained reactivity: value + live subscriber set, explicit
  subscribe/unsubscribe (no automatic tracking in v1), DOM-first rehydration.
- **`Render` / `RenderFactory` / `SsrBuild`** — the lifecycle contract the emit
  produces per block/component (`create/hydrate/mount/update/remove`).
- **`FudicElement`** — the N3 custom-element base: hydrates the DSD shadow the
  SSR sent, or cold-creates it, then mounts; symmetric teardown on disconnect.
- **`delegate`** — N2 global event delegation: one listener per `(root, type)`,
  dispatched by the `data-fud-e` marker.
- **`styles`** — the `<style host>` registry for client-created instances: builds
  the sheet once from the hoisted `<style host="tag">` in the head and adopts the
  same reference into every shadow root. SSR/DSD instances are adopted pre-paint
  by the page polyfill the compiler emits (not part of this package).
- **`hydrateRoot` / `mountRoot`** — bootstrap for page blocks that are not
  custom elements.
- **`defineLazy`** — the hydration scheduler: defers `customElements.define` per
  strategy (`eager`, `interaction`, `viewport`, `idle`).
