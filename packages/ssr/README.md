# @fudic/ssr

The build (server-side rendering) adapter of the fudic runtime (SDD-14 + SDD-16).

- **`SsrDom`** — implements the construction contract `Dom<SsrNode>` over a detached node tree.
  It does **not** implement `DomClient`: there is no hydration or in-place reactive mutation in
  SSR, so there are no traversal or `setText`/`setProp` methods — and thus no method that throws.
- **`serializeChunks`** — the single lazy tree walk, a generator of HTML text pieces with
  Declarative Shadow DOM: void elements self-close, rawtext (`script`/`style`) is emitted
  unescaped, a shadow root becomes `<template shadowrootmode="open">…</template>`, and
  text/attribute values are escaped per context (`escapeText`/`escapeAttr`/`neutralizeComment`,
  exported so the emit reuses the same rules).
- **`renderToString`** — the walk joined into a string (unchanged contract).
- **`renderToStream` / `htmlToByteStream`** — the walk (or any sync/async sequence of HTML
  pieces, e.g. the emit's `async function*`) encoded as a UTF-8 `ReadableStream<Uint8Array>`:
  pull-based, coalescing up to `highWaterMark` bytes per chunk, yielding on platform
  backpressure, never splitting a multi-byte code point.

Because both `SsrDom` and `browserDom` (from `@fudic/dom`) implement the same `Dom<N>`
construction contract, one build body runs unchanged on both — building a live DOM in the
browser or a serialized string at build time.
