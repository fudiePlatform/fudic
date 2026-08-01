# @fudic/core

The client runtime of fudic (SDD-14, SDD-15 §3.7).

- **`signal`** — fine-grained reactivity: value + live subscriber set, explicit
  subscribe/unsubscribe (no automatic tracking in v1), DOM-first rehydration.
- **`FudicElement`** — the base class of every N3 custom element. The emitted
  chunk of a component carries its `static c($props)` factory and the
  `customElements.define`, and nothing else; the instance scaffolding lives here.
  - `h(props)` — the instance came from SSR: the shadow root is already populated
    by the DSD, so the controller adopts those nodes. `props` is the instance's
    slice of the payload, handed over by the runtime.
  - `c(props)` — the instance was created at runtime by the parent controller:
    a shadow is opened and the nodes are fabricated.
  - `disconnectedCallback()` → `r()`, the only real lifecycle callback.
  - **No `connectedCallback`.** A component does not know its own `data-id`, so
    it cannot read its own slice: the runtime hands out slices per tag, at the
    moment it defines the tag. `h`/`c` are invoked from outside.
- **`Controller` / `FudicElementCtor`** — the types of that contract. The second
  exists because TypeScript has no `static abstract` member.

The base must travel in the runtime module the page already loads on startup, so
that a chunk downloaded on the first interaction resolves its
`import { FudicElement }` against an already-evaluated module: no extra request
inside the gesture, and the bytes saved by not emitting the scaffolding do not
turn into an INP cost.

Retired with SDD-15 / SDD-17:

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
