# @fudic/ssr

The build (server-side rendering) adapter of the fudic runtime (SDD-14).

- **`SsrDom`** — implements the construction contract `Dom<SsrNode>` over a detached node tree.
  It does **not** implement `DomClient`: there is no hydration or in-place reactive mutation in
  SSR, so there are no traversal or `setText`/`setProp` methods — and thus no method that throws.
- **`renderToString`** — serializes the tree to HTML with Declarative Shadow DOM: void elements
  self-close, rawtext (`script`/`style`) is emitted unescaped, a shadow root becomes
  `<template shadowrootmode="open">…</template>`, and text/attribute values are escaped per
  context.

Because both `SsrDom` and `browserDom` (from `@fudic/dom`) implement the same `Dom<N>`
construction contract, one build body runs unchanged on both — building a live DOM in the
browser or a serialized string at build time.
