# @fudic/vite

The Vite plugin for **fudic** (SDD-19, rewired by SDD-20). It is the **linker** over the
filesystem-free compiler emit: it discovers `.fud` pages, transforms every `.fud` to a
module (Vite owns the graph), emits each route's chunk in **two formats** — ESM for the
edge and prerender, `exports`/`require` for the Service Worker's own linker — the manifest
both sides read, and the two bootstraps (Service Worker, main thread). Vite is
bundler/dev-server only — the parser is always `@fudic/compiler`; Vite never parses
`.fud`.

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

export default defineConfig({
  plugins: [fudic()],
});
```

## Filesystem routing

Pages live under `routesDir`, which defaults to `ROUTES_DIR` of `@fudic/conventions` —
`src/routes` — the same name `fudic new` writes to, so a generated project needs no options at
all. The directory path is the URL:

| File | Route |
|---|---|
| `src/routes/index.fud` | `/` |
| `src/routes/about.fud` | `/about` |
| `src/routes/customer/index.fud` | `/customer` |
| `src/routes/customer/[id].fud` | `/customer/:id` |

Only page documents (a `<!DOCTYPE html>`) are routes; component `.fud` files are pulled in
transitively through `<link rel="component">` and may live anywhere — a shared
`src/components/` directory outside `routesDir` resolves from any route depth. Routes are ordered by descending
specificity (static before param), which the emitted manifest matches first-hit.

A project that keeps its routes elsewhere says so, and the option always wins over the default:

```ts
export default defineConfig({
  plugins: [fudic({ routesDir: 'routes' })],
});
```

## SSG modes

Three modes, and the page is the one that decides (`strategy()`); the filesystem facts
only fill in when it declares nothing:

- **`ssg`** — data is build-known → prerendered. The build runs the route's chunk and
  writes its HTML (`/about` → `about/index.html`) and the browser fetches the file.
- **`sw`** — rendered locally by the Service Worker from its linked chunk, with the data
  coming from the endpoint the plugin generates for `@server load`.
- **`ssr`** — always the server. Never inferred: declare it for session or permissions.

```
@code {
  @server {
    import { strategy } from '@fudic/core';
    strategy({ mode: 'sw', data: { ttl: '5m', policy: 'cache-first' } });
  }
}
```

**No `sw.json` at the project root, no Service Worker**: every route is then served by the
server, which is an explicit decision rather than a silent default.

A page declares its data with a `@server` region:

```
@code {
  @server {
    export function load(ctx) { return db.get(ctx.params.id); }
    export function paths() { return db.allIds(); } // optional: enumerate for prerender
  }
}
```

## Options

```ts
interface FudicOptions {
  routesDir?: string;                              // default ROUTES_DIR ('src/routes')
  manifestUrl?: string;                            // default `${base}fudic-routes.json`
  prerender?: boolean;                             // default true
  paramFallback?: 'lazy' | 'notFound';             // default 'lazy'
  routes?: Record<string, { mode: 'static' | 'incremental' | 'exclude' }>;
}
```

## Client chunks

Every component of the graph also leaves a **client chunk** in the output —
`assets/h/<tag>-<hash>.js` — carrying its `static c($props)` factory and its
`customElements.define` (SDD-15 §6.8). One per component, with **no level filter**:

```
dist/assets/h/app-card-ZMxPH5VP.js     the factory + define of <app-card>
dist/assets/element-Czbkvc-4.js        FudicElement, split out and shared by all of them
```

There is no filter because there is nothing to filter on. A component has no level of its
own — one that is N1 in isolation becomes N3 the moment an ancestor hands it a reactive
prop — and rendering happens in two places, both of them with data in hand: the server (or
the edge) at request time, and the Service Worker at navigation time. What a template
paints is not known until the data reaches it, so the chunk has to exist before anyone can
ask who hydrates. A chunk nobody requests costs nothing; one that was never emitted cannot
be invented at run time.

Components are reached through the graph (`<link rel="component">`, transitively and
through the layout chain), so a component nobody links gets no chunk, and an excluded route
contributes none. The chunk is bundler input: its `@code { @client }` region is copied
verbatim, TypeScript included, and type-stripped here — which is also why a broken one
fails at build time instead of at hydration.

There is no map from tag to chunk URL: a tag's chunk is `hydrateUrl(tag)` off the manifest,
so publishing it again inside the HTML would be the same fact caching by two different
rules. What the prerendered page does carry is the `data-fud-id` of every hydratable
instance and the three JSON blocks (`fud-state`, `fud-tree`, `fud-bus`) at the end of its
body — written by the render, so the prerender and the Service Worker produce the same bytes.

## Status

Slice 1 (this package) targets SSR / zero-JS pages served through the three-thread shell,
plus the client chunks above.

`transform` emits a Source Map v3: the compiler anchors each verbatim source slice
(interpolation, `@if`/`@foreach` headers) to its `.fud` offset, so a runtime error in the
served JS navigates back to the source.

Static relative asset URLs — `src`/`poster`, `<link href>`, and CSS `url(…)` — are
linked through Vite: the emit rewrites them to ES imports, so Vite resolves, hashes and
emits each asset (absolute/`data:`/`<a href>`/dynamic refs are left untouched). `srcset`
(a multi-URL list) is the one remaining asset follow-up.

The `@server` region (typed `load`/`paths`) is served through the `?server` module,
type-stripped to plain JS by Vite's Oxc transform.

`vite dev` is the edge: it serves the manifest (every route `ssr` — Vite serves ESM
untransformed, so there is nothing to link in dev), the generated `/_fudic/data/…`
endpoints, and every navigation rendered on demand through Vite's SSR graph with the dev
client injected. The Service Worker is **not registered in dev** unless `sw.json` says
`"dev": "preview"`, which is what SvelteKit, Next and Nuxt do and what keeps HMR sane.

`vite preview` is the production edge: prerendered files where they exist, the data
endpoints, on-demand render for the rest, and on every document a CSP header with a fresh
nonce stamped into the page.

## The two bootstraps

A page opts into the shell by referencing the main-thread bootstrap in its `<head>`:

```html
<script type="module" src="/fudic-main.js"></script>
```

It registers the Service Worker and tells it where the user is — the single warm trigger,
which is what pulls that route's chunk and its dependencies into the cache behind the
navigation already in flight. The plugin emits `fudic-sw.js` and `fudic-main.js` with
stable, root-level names (a Service Worker under `assets/` would be scoped to `assets/`,
and a hashed name cannot be written by hand). Everything else keeps Vite's content hash.
Configure `build.rollupOptions.output` and those names become yours to keep.

Until the router is ready and its template warm, the Service Worker does not intercept:
the network answers, which is exactly right for a prerendered route.

A param route with `@server paths()` prerenders one file per enumerated id
(`customer/1/index.html`…); `paramFallback:'lazy'` lets the Service Worker render unknown
ids locally, `'notFound'` leaves them a 404. A literal `src`/`url()` to a missing file raises
`FUD0363` and stays a literal — the build does not abort.

Out of scope (SDD-19 §7): the hydration RUNTIME of SDD-17 — the capturer that reads
`data-fud-id` and the three maps and lifts an instance — and `srcset` multi-URL linking.
