# `@fudic/formatter`

The formatter for `.fud` files (SDD-26). One binary for both consumers: the LSP server
(SDD-24) formats with it, and `fudic fmt` formats with it. If the editor and the pipeline
disagreed, the product would be broken.

## What it is

A **printer of its own over a document IR** (`group`, `indent`, `line`, `softline`, `fill`,
`hardline`), not a router that hands ranges to native formatters and glues the pieces back.
Delegating by range dies the moment an `@if` splits an HTML tree: no external formatter ever
sees a valid document, and reindenting the returned pieces has no correct answer.

The tree is never delegated; the leaves are:

| Region | Formatted by |
|---|---|
| markup, Razor directives, bindings, attributes | this printer |
| `@code`, `@server`, `@client`, `@{ … }` | JS/TS formatter |
| control headers, `@(expr)`, `@expr` | JS/TS formatter, behind a sentinel |
| `<style>` | CSS formatter, behind placeholders |
| `<script>`, `<pre>`, `<textarea>` | nobody — copied byte for byte |

Both leaves are `oxfmt`: in-process NAPI, same toolchain as `oxc-parser`, and it formats TS
and CSS through the same call.

## Invariants

- **Never throws.** Not on broken input, not on an invalid fragment.
- **Never loses code.** Every region of the source shows up in the output: delegated,
  reindented, or copied verbatim.
- **Never creates nor destroys a whitespace run** in HTML content — it only rewrites one.
  That is what makes the rendered document provably identical, and it is what the emit
  equivalence test measures.
- **Idempotent** and **deterministic**, byte for byte, on any platform.
- **Does not consult types.** AST only. It depends on neither the LSP nor `tsserver`.

## Usage

```ts
import { format, formatRange } from '@fudic/formatter';

const result = await format(source, { printWidth: 100 });
if (result.ok) console.log(result.text);
```

A file with parse errors is not formatted: `format` returns `{ ok: false, diagnostics }`.
Formatting an incomplete AST would reorganize code the user is halfway through writing.
