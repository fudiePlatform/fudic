# @fudic/vite

The Vite plugin for **fudic** (SDD-19). It is the **linker** over the filesystem-free
compiler emit: it discovers `.fud` pages, transforms every `.fud` to a module (Vite owns
the graph), emits a `RenderChunk` per route, the `route→chunk` manifest that
`@fudic/transport` loads, and the three-thread bootstraps (Service Worker, Web Worker,
main). Vite is bundler/dev-server only — the parser is always `@fudic/compiler`; Vite
never parses `.fud`.

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

export default defineConfig({
  plugins: [fudic({ routesDir: 'routes' })],
});
```

## Filesystem routing

Pages live under `routesDir` (default `routes/`). The directory path is the URL:

| File | Route |
|---|---|
| `routes/index.fud` | `/` |
| `routes/about.fud` | `/about` |
| `routes/customer/index.fud` | `/customer` |
| `routes/customer/[id].fud` | `/customer/:id` |

Only page documents (a `<!DOCTYPE html>`) are routes; component `.fud` files are pulled in
transitively through `<link rel="component">`. Routes are ordered by descending
specificity (static before param), which the emitted manifest matches first-hit.

## SSG modes

Two modes map onto SDD-16's `dynamic` flag, so the Service Worker router is unchanged:

- **static** — data is build-known → prerendered eagerly. The build runs the route's
  RenderChunk and writes its HTML (`/about` → `about/index.html`); the manifest entry is
  `dynamic:false`, so the SW never intercepts and the browser fetches the file directly.
  (Enumerated param prerender via `@server paths()` is the remaining prerender follow-up.)
- **incremental** — rendered by the WW on first request, then persisted by the SW cache
  (lazy SSG). Param routes are incremental by default; `@server paths()` warms a subset.

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
  routesDir?: string;                              // default 'routes'
  manifestUrl?: string;                            // default `${base}fudic-routes.json`
  prerender?: boolean;                             // default true
  paramFallback?: 'lazy' | 'notFound';             // default 'lazy'
  routes?: Record<string, { mode: 'static' | 'incremental' | 'exclude' }>;
}
```

## Status

Slice 1 (this package) targets SSR / zero-JS pages served through the three-thread shell.
The client hydration emit of SDD-15 is paused (performance study); its chunks and the
`tag→chunk` hydration manifest plug in here later.

`transform` emits a Source Map v3: the compiler anchors each verbatim source slice
(interpolation, `@if`/`@foreach` headers) to its `.fud` offset, so a runtime error in the
served JS navigates back to the source.

Static relative asset URLs — `src`/`poster`, `<link href>`, and CSS `url(…)` — are
linked through Vite: the emit rewrites them to ES imports, so Vite resolves, hashes and
emits each asset (absolute/`data:`/`<a href>`/dynamic refs are left untouched). `srcset`
(a multi-URL list) is the one remaining asset follow-up.

The `@server` region (typed `load`/`paths`) is served through the `?server` module,
type-stripped to plain JS by Vite's Oxc transform.

`vite dev` serves what `generateBundle` produces in build: the manifest (from
`manifestUrl`, every route incremental — mode-1 pages render on-demand rather than
prerendering on each save) and the three bootstraps at stable root URLs, the Service
Worker with `Service-Worker-Allowed` so it registers at root scope. The wrapper and page
modules are served by Vite's module graph with live source maps.

A param route with `@server paths()` prerenders one file per enumerated id
(`customer/1/index.html`…); `paramFallback:'lazy'` keeps a `dynamic:true` entry for
unknown ids, `'notFound'` does not. A literal `src`/`url()` to a missing file raises
`FUD0363` and stays a literal — the build does not abort.

Out of scope (SDD-19 §7): the SDD-15 client hydration branch (paused) and `srcset`
multi-URL linking.
