# @fudic/core

The client runtime of fudic (SDD-14).

- **`signal`** — fine-grained reactivity: value + live subscriber set, explicit
  subscribe/unsubscribe (no automatic tracking in v1), DOM-first rehydration.

That is the whole surface for now, and the emptiness is deliberate: everything
else this package used to hold was shaped for a runtime model that has been
retired, and the pieces that replace it are emit contracts that will land with
the emit itself (SDD-15), not before it.

Retired with SDD-15 / SDD-17:

- `FudicElement` — the N3 base class returns as part of the emit implementation,
  but with a different shape: it wraps the emitted `static c($props)` factory,
  routes `h`/`c` from outside (the runtime hands each instance its state slice,
  since a component cannot know its own `data-id`), and calls `r()` from
  `disconnectedCallback`. It has no `connectedCallback` logic at all.
- `Render` / `RenderFactory` / `SsrBuild` — this was the *component* lifecycle of
  SDD-14, driven by the old `FudicElement`. Keeping it relabelled as the block
  contract was a mistake: its `mount` meant subscription where the emit's `m`
  means structural mount, its `hydrate` took a `Cursor` where the emit bakes
  positional traversal, and `RenderFactory` demanded `DomClient`, which forbids
  the one-controller-two-adapters rule (SDD-15 §3.8). The block render contract
  will be defined by whichever SDD ends up owning `@if` / `@foreach` emission.
- `hydrateRoot` / `mountRoot` — root hydration is now the global capturer's job
  (SDD-17 §4.4, `attachAll`).
- `defineLazy` / `HydrationStrategy` — hydration is decided by the page, not
  declared by the component (grammar decisions 63-65 retired).
- `delegate` — hookup is per instance in the controller's `s()`.
- `styles` / `StyleRegistry` — `<style host>` abandoned; component styles are a
  shared sheet (`<style type="module">` + `shadowrootadoptedstylesheets`, SDD-18,
  emitted by SDD-15 §4.8), with a polyfill until native support is universal.
