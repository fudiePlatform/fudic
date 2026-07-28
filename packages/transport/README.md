# @fudic/transport

The client shell of fudic (SDD-20). Every navigation is a `FetchEvent` a **Service
Worker** intercepts, and the SW is the one that renders: it links the route's chunk,
fetches its data and streams the HTML into the `Response`, so the browser paints while
streaming and materializes the declarative shadow roots natively. One decision branch in
the whole system, and it is synchronous.

**Why not a Web Worker.** Measured in Chromium 151 and WebKit 26.5: a WW belongs to its
document and dies with it, so a render requested during a navigation never finishes — the
stream stays open forever (a spinner, not truncated HTML), and in WebKit the WW cannot
even reach the network while its document unloads. The Service Worker belongs to no
document: it owns the `Response` from start to finish.

**Why a hand-written linker.** A `ServiceWorkerGlobalScope` forbids `import()`
([w3c/ServiceWorker#1356](https://github.com/w3c/ServiceWorker/issues/1356)) and only
allows `importScripts()` during `install`, which would mean loading every route at once.
So chunks are linked with `new Function`, and `/fudic-sw.js` — and only it — is served
with `'unsafe-eval'`. A Service Worker does not inherit the document's CSP, so documents
stay strict.

- **Manifest** — `compileManifest` / `loadManifest(url, cache)`: the single route
  contract (`build`, `csp`, `routes` with mode, chunk, topological `deps`, data endpoint
  and policies). Read from the SW's own cache, never the network, so the fetch decision
  can be synchronous.
- **Linker** — `createLinker` / `canLink`: `exports`/`require` modules evaluated once,
  registered globally (a component shared by 50 routes compiles once), cycle-safe, with
  `//# sourceURL` so DevTools can show the code.
- **Store** — `createStore` / `cacheNames`: the four build-namespaced caches, cache
  policies, TTL by stored stamp, in-flight deduplication and FIFO pruning.
- **Router** — `createRouter`: `respondWith` ONLY when it will actually serve; render →
  `Response`, prerendered page from cache, warm behind a cold navigation, and a single
  rescue `fetch` when a chunk fails to link.
- **CSP** — `newNonce` / `cspFor` / `applyNonce`: a nonce per response, and the
  `__FUDIC_NONCE__` token that prerendered HTML carries until someone serves it.
- **Main** — `registerRenderServiceWorker(url)` (module SW, `updateViaCache: 'none'`) and
  `notifyLocation()`: the single warm trigger.

No runtime dependencies: the whole surface is platform types. `@fudic/ssr` is a
devDependency, used by the tests to build real render streams.
