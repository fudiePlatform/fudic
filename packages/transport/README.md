# @fudic/transport

The three-thread client transport shell of fudic (SDD-16). Every navigation is
a `FetchEvent` a **Service Worker** intercepts; dynamic routes delegate to a
**Web Worker** that `import()`s the view chunk and produces the HTML byte
stream; the SW pipes it to the `Response` (with `tee()` to cache) and the
browser paints while streaming. The **main thread** only registers the SW and
hydrates (SDD-14). Zero distributed routing runtime: one decision branch in the
whole system — cache hit or miss.

- **Message contract** — `RenderRequest` / `RenderMessage` / `ControlMessage`.
  Data travels on a 1:1 `MessagePort` per request; control on a
  `BroadcastChannel` (`controlBus`). The two channels never mix.
- **Transport adapter** — `canTransferStream` (capability probe, not UA),
  `sendRender` / `receiveRender`: native `ReadableStream` transfer, or the
  isolated degraded fan-out of `ArrayBuffer` chunks for Safari.
- **Manifest** — `loadManifest(url)`: the single route→chunk source SW and WW
  share (same absolute URL, versioned with the build).
- **WW** — `serveRender` / `installRenderWorker`: a local render server running
  the same emitted generator an edge worker would. `RenderChunk` is injected
  (DIP), so the shell tests without the emit.
- **SW** — `createRouter`: cache hit → cached response; miss → delegate to the
  WW, `tee()` to response + cache, close the per-request port.
- **Main** — `registerRenderServiceWorker(url)`.

No runtime dependencies: the whole surface is platform types. `@fudic/ssr` is a
devDependency, used by the tests to build real render streams.
