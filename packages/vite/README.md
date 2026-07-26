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

- **static** — data is build-known → prerendered (eager).
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
`tag→chunk` hydration manifest plug in here later. Source maps and asset URL rewriting
depend on the emit anchoring output↔source offsets, and are follow-ups.
