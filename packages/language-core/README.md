# `@fudic/language-core`

Virtual TypeScript emitter for `.fud` files (SDD-23). Given the AST of a `.fud`, it
produces synthetic TypeScript and CSS files plus the offset mapping between them and the
original, so that `tsserver` and the CSS service provide completion, hover, go-to-
definition, rename, narrowing and diagnostics **without this project writing any language
intelligence of its own**.

The thesis: *no intelligence is implemented, a projection is*. Resolving a tag to a
component, checking an attribute's type, typing `data`, forbidding a `@server` symbol in
the template — each becomes an error the TypeScript checker already knows how to report.

This is the **second emitter over the same AST**. It shares nothing with the runtime
emitter but the tree: the runtime emitter may collapse, reorder and elide; this one may do
none of those, because every emitted token must map back to a span of the source.

## Public API

```ts
import { emitVirtualFiles, GLOBALS_DTS } from '@fudic/language-core';

const virtuals = emitVirtualFiles(ast, registry);
```

- `emitVirtualFiles(ast, registry)` — the three virtual files of a `.fud`: the client
  `.fud.ts`, the server `.fud.server.ts`, and one `.fud.<n>.css` per `<style>`.
- `GLOBALS_DTS` — the ambient declarations the projection is written against. The language
  server mounts them as a virtual lib; the CLI writes the same text to disk for `tsc`.
- `FileRegistry` — the injected port that resolves a tag to its `.fud` path. It performs no
  I/O: the workspace index lives in the server (SDD-24).

## Invariants

- User fragments are copied **verbatim**, with 1:1 length mapping. No reformatting.
- Every emitted span carries explicit `caps`; scaffolding is invisible (all caps `false`).
- The emitter **never throws**: a partial AST yields a partial virtual file.
- Deterministic: same AST ⇒ same output, byte for byte.

Consumers: `@fudic/language-server` (SDD-24). Not the runtime emitter, and not the
formatter (SDD-26) — virtual files are never formatted; their layout *is* the mapping.
