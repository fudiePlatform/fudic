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

Only routes — a `.fud` that starts with `<link rel="layout">` — are pages. A file with a `<!DOCTYPE html>` is a layout, never a route. Component `.fud` files are pulled in
transitively through `<link rel="component">` and may live anywhere — a shared
`src/components/` directory outside `routesDir` resolves from any route depth. Routes are ordered by descending
specificity (static before param), which the emitted manifest matches first-hit.

A project that keeps its routes elsewhere says so, and the option always wins over the default:

```ts
export default defineConfig({
  plugins: [fudic({ routesDir: 'routes' })],
});
```

## Modes

Three modes, and the page is the one that decides, on the `load` line of its `.fudapi`; the
filesystem facts only fill in when it declares nothing:

- **`ssg`** — rendered once, by the build. The build runs `load` and writes the page's HTML
  (`/about` → `about/index.html`), which the server sends as it is.
- **`ssr`** — rendered by the server on every request. Never inferred: declare it for session
  or permissions.
- **`sw`** — rendered by the Service Worker from its linked chunk, with the data coming from
  the endpoint the plugin generates for `load`. Without a Service Worker, the server renders it.

```
load sw ttl 5m cache-first
  posts  Post[]
```

Declared nothing: no `load` is `ssg`; params with `paths` are `ssg`, one page per value;
anything else is `sw`.

**No `sw.json` at the project root, no Service Worker**: every route is then served by the
server, which is an explicit decision rather than a silent default.

A page declares its data in its `.fudapi`, and the app implements it in `src/server`:

```
// src/routes/blog/[slug].fudapi
load
  title  str
  body   str

paths
```

```ts
// src/server/blog.ts
import { load, paths } from 'fudic:routes/blog/[slug]';

load.handle(async (ctx) => await getPost(ctx.params.slug));
paths.handle(async () => await listSlugs()); // enumerate for prerender
```

## Options

Everything Vite already owns — `base`, `build.outDir`, `build.sourcemap`, `build.minify`,
`build.target` — is read from Vite's config and is not an option here. The Service Worker's
own build inherits the same output options.

```ts
interface FudicOptions {
  routesDir?: string;                                    // default ROUTES_DIR ('src/routes')
  manifestUrl?: string;                                  // default `${base}fudic-routes.json`
  prerender?: boolean;                                   // default true
  paramFallback?: 'lazy' | 'notFound';                   // default 'lazy'
  defaults?: Record<string, { mode: 'ssg' | 'ssr' | 'sw' | 'exclude' }>;
  sw?: boolean;                                          // default true
  edgeDir?: string;                                      // default '.fudic/edge'
}
```

- **`routesDir`** — the directory of the pages, relative to the project root.
- **`manifestUrl`** — where the route manifest is published. Absolute (`FUD0365`): the page and
  the Service Worker load it from different places.
- **`prerender`** — `false` writes no page at build time: the routes that would be `ssg` are
  rendered on demand, and the build finishes sooner.
- **`paramFallback`** — a value `paths` did not give: `'lazy'` renders it on demand,
  `'notFound'` answers the error page with a `404`.
- **`defaults`** — the mode of a route that declares none, keyed by its pattern (`'/admin'`,
  `'/drafts/:id'`). `exclude` leaves the route out of the build. The page always wins; a route
  that declares a mode and is also listed here gets `FUD0397`.
- **`sw`** — `false` builds the project without a Service Worker, as if it had no `sw.json`.
- **`edgeDir`** — where the server bundle is written and the preview reads it. A second build of
  the same root (with `sw: false`, to compare) names its own.

Three more are for tools, not apps: `liveCheck` (dev's live typecheck, off in `@fudic/testing`),
`serverReload` (reload on a server-graph edit, off in the workbench) and `sourceLocations`
(`data-fud-src` on every element in dev, on in the workbench).

## Dev, build and preview

- **`fudic dev`** runs each app's Vite and renders every page on every request, whatever its
  mode. It checks the types live: a page whose graph has an error is not served, and the overlay
  shows the error with the position the editor marks. `.fudapi`, the three `.headers` and the
  catalogs are re-read without a restart.
- **`vite build`** typechecks the whole project in a child process while it bundles, prints
  every problem and fails once with the count. It emits the browser chunks, the server
  (`.fudic/edge/server.mjs`), the Service Worker in its own build and the prerendered pages.
- **`fudic preview`** runs that `server.mjs` with `createServer` of `@fudic/server`, as an
  adapter does in production. Without `FUDIC_SECRET` it signs with a secret of its own.

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

## Under the hood

`transform` emits a Source Map v3: the compiler anchors each verbatim source slice
(interpolation, `@if`/`@foreach` headers) to its `.fud` offset, so a runtime error in the
served JS navigates back to the source.

Static relative asset URLs — `src`/`poster`, `<link href>`, and CSS `url(…)` — are
linked through Vite: the emit rewrites them to ES imports, so Vite resolves, hashes and
emits each asset (absolute/`data:`/`<a href>`/dynamic refs are left untouched). `srcset`
(a multi-URL list) is the one remaining asset follow-up.

A page's `load` and `paths` are declared in its `.fudapi` and implemented in `src/server`;
the generated `fudic:` modules and the handlers are type-stripped to plain JS by Vite's Oxc
transform.

`vite dev` is the edge: it serves the manifest (every route `ssr` — Vite serves ESM
untransformed, so there is nothing to link in dev), the generated `/_fudic/data/…`
endpoints, and every navigation rendered on demand through Vite's SSR graph with the dev
client injected. Both go out as they are produced: a page with `@await` in parts, a data
endpoint as `application/fud+frames` — what `load` resolved first, then one frame per `later`
field as it settles (SDD-70). The Service Worker is **not registered in dev** unless `sw.json` says
`"dev": "preview"`, which is what SvelteKit, Next and Nuxt do and what keeps HMR sane.

`vite preview` is the production edge: prerendered files where they exist, the data
endpoints, on-demand render for the rest, and on every document the headers of `page.headers`,
with a fresh nonce stamped into the page when they ask for one (see Headers).

## Early hints

While `load` waits on the backend, the browser has nothing to do. The build writes, for each
route, what its page needs before the body — its stylesheets, `boot`, `main` and what `main`
imports — as ready-made `Link` values in `fudic-routes.json` (`routes[].hints`), and those of
`_error.fud` at the top (`errorHints`).

The server sends them as a `103 Early Hints` before running `load`, and always on the final
response. The contract is the manifest, so any backend does the same in a few lines:

```
on a page request:
  route = manifest.match(path)
  hints = route ? route.hints : manifest.errorHints
  if hints is empty: go on
  if HTTP/2 or later
     and header "sec-fetch-mode" == "navigate"
     and the server can send a 1xx:
        send 103 with  Link: hints joined by ", "
                       and the page's Content-Security-Policy and Referrer-Policy
  answer as ever, and on that answer:
     Link: the hints of what was painted — errorHints when load threw
```

- The browser checks the preloads of a `103` against the CSP that came with it: send the page's
  own, with the same nonce as the final response.
- One `103` per response; Chrome ignores the rest. There is no browser detection: a client
  that does not understand a `103` ignores it.
- Only pages. A data endpoint, a server function or a static file gets neither.
- A server that cannot send a `1xx` sends the `Link` alone: a CDN turns it into a `103`, and the
  browser preloads with it too, later.
- `"earlyHints": false` in `fudic.json` writes no hints, so nothing is sent.

`vite dev` and `vite preview` do this. Over plain HTTP they are HTTP/1.1 and send only the `Link`;
with `server.https` / `preview.https` they speak HTTP/2 and send the `103` too.

## Headers

An app's headers are three text files at its root: `page.headers` (every page and `_error`),
`sw.headers` (`/fudic-sw.js`) and `assets.headers` (the static files, by path). The build reads
them and writes them into `fudic-routes.json` as `headers`: `page` and `sw` are name → value, and
`assets` is a list of `{ pattern, headers }`, most specific first, where `''` means "do not send".

A value may hold a placeholder, `{name}`, that whoever answers fills for each response. Today there
is one: `{nonce}`. Any backend does what `@fudic/server` does:

```
on a page:
  if some value of manifest.headers.page holds "{nonce}":
    nonce = 16 random bytes, base64url, new for THIS response
    every "{nonce}" in those values    -> nonce
    every "__FUDIC_NONCE__" in the HTML -> nonce   (prerendered pages, and streams chunk by chunk)
  send the headers of manifest.headers.page
on its 103:       of those, Content-Security-Policy and Referrer-Policy, same nonce
on /fudic-sw.js:  manifest.headers.sw
on a static file: for each name, the most specific rule of manifest.headers.assets; '' = none
```

- `Strict-Transport-Security` only over HTTPS.
- What `load` writes loses to any header of `page.headers`.
- `/fudic-sw.js` and the manifest also go with `Cache-Control: no-cache`, and the worker with
  `Service-Worker-Allowed` and the app's `base`, whatever `assets.headers` says.
- Without `{nonce}` in `page.headers` there is no nonce: none is made, and the HTML carries none.

Filling a placeholder is replacing a fixed text with another — no template engine, no regular
expression:

Node (the one `@fudic/server` uses):

```js
const fill = (value, nonce) => value.split('{nonce}').join(nonce);
```

Go:

```go
func fill(value, nonce string) string { return strings.ReplaceAll(value, "{nonce}", nonce) }
```

Java:

```java
static String fill(String value, String nonce) { return value.replace("{nonce}", nonce); }
```

Python:

```python
def fill(value: str, nonce: str) -> str: return value.replace("{nonce}", nonce)
```

C#:

```csharp
static string Fill(string value, string nonce) => value.Replace("{nonce}", nonce);
```

Rust:

```rust
fn fill(value: &str, nonce: &str) -> String { value.replace("{nonce}", nonce) }
```

## The two bootstraps

Nobody writes them by hand: the compiler puts them in the page's `<head>` when it needs them.

- **`fudic-boot-<build>.js`** registers the Service Worker and tells it where the user is — the
  single warm trigger, which pulls that route's chunk and its dependencies into the cache behind
  the navigation already in flight. Every page, when the app has a `sw.json`.
- **`fudic-main-<hash>-<build>.js`** is the coordinator of a page that hydrates: it names the
  runtime pieces that page needs. There is one per combination of pieces, not one per app.

The Service Worker, `fudic-sw.js`, has its own build and a stable, root-level name (a Service
Worker under `assets/` would be scoped to `assets/`). Everything else keeps Vite's content hash.
Configure `build.rollupOptions.output` and those names become yours to keep.

Until the router is ready and its template warm, the Service Worker does not intercept:
the network answers, which is exactly right for a prerendered route.

A param route with `paths` prerenders one file per enumerated value
(`customer/1/index.html`…); `paramFallback: 'lazy'` renders unknown values on demand,
`'notFound'` answers them a 404. A literal `src`/`url()` to a missing file raises
`FUD0363` and stays a literal — the build does not abort.

Out of scope: `srcset` multi-URL linking.
