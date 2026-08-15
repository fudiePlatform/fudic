# @fudic/core

The client runtime of fudic. Two faces, and a page uses both: the **hydration
runtime**, the single module a page downloads on load, and **`FudicElement`**,
the base class the chunk of a component resolves against once it is downloaded.

## The hydration runtime

`installHydration({ root, resolveChunk, warm })` installs one listener, in the
capture phase, and downloads nothing. The page is already painted — HTML, CSS
and declarative shadow roots — and no component has JavaScript until the user
touches one.

The bootstrap the build emits calls it for you. **The layout must load that
bootstrap**, and the CLI templates already do:

```html
<script type="module" src="/fudic-main.js"></script>
```

Without that line a page paints and never reacts to a click.

### The three paths of a click

The capturer finds the nearest `[data-fud-id]` host along `composedPath()` and
decides by state:

1. **The instance is already live** — it withdraws. The component's own listener
   handles the event with the real `ev`. This is what makes a replay impossible
   to double-fire.
2. **First interaction, tag not defined** — nobody would have handled the
   gesture, so it is cancelled, the bus receivers of the tag are raised first,
   then the composition subtree in post-order, then the host, and the original
   event is dispatched again, once. The user's handler runs with everything it
   presupposes alive.
3. **First interaction, tag already defined by another instance** — the listener
   already existed in this same propagation. The runtime marks the instance and
   withdraws: no download, no replay.

Downloads are per tag, hydration is per instance: two instances of a tag share
one chunk and still hydrate each on its own first click.

### The two ports

The runtime never branches on how the page was built; the bootstrap injects the
two answers that depend on it.

| port | with a Service Worker | without one |
|---|---|---|
| `resolveChunk(tag)` | the URL derived from the build id | the URL the dev server publishes |
| `warm(urls, tags)` | a `postMessage` to the worker | `<link rel="modulepreload">` |

### Without a Service Worker

Hydration does not need one, and three of the four real cases have none: an app
with no `sw.json`, `pnpm dev`, and every first load before the worker takes
control. What changes is only the anticipated network:

- With a worker, chunks land in Cache Storage and survive navigations, and a
  warmed tag brings the files its chunk imports with it.
- Without one, `modulepreload` fetches and parses without evaluating, for this
  page only, and the browser does not fetch the imports of a preloaded module:
  the first gesture of the page pays for the shared code once, and every warmed
  tag after it costs no network.

Warm is an optimization in both: hydration is correct with it and without it.

### Warm

A tag is anticipated when the first of its instances enters the viewport — once
per tag, closure included (its bus receivers and its subtree), ordered in idle,
at a low priority. A component below the fold costs no network until the user
scrolls near it.

Three events are published on `document` for instrumentation: `fud:ready`,
`fud:hydrated` (`{ id, tag, ms, from }`) and `fud:warmed` (`{ tag }`).

## The signals and the element base

(SDD-14, SDD-15 §3.7.)

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
  - **No `connectedCallback`.** A component does not know its own `data-fud-id`, so
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
