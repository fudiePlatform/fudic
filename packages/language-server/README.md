# `@fudic/language-server`

The LSP server for `.fud` files (SDD-24). It is **plumbing**: every answer comes from the
virtual projection of [`@fudic/language-core`](../language-core) (SDD-23) and from services
that already exist — TypeScript, HTML and CSS. This package decides how they are assembled,
which requests are served, and when state is thrown away.

Editor-agnostic by design, not by taste: the same binary serves VS Code (SDD-25), Zed and
Neovim. Nothing from `vscode-*` beyond the protocol packages enters here.

## Running it

```sh
fudic-language-server --stdio
fudic-language-server --node-ipc
fudic-language-server --socket=6009
```

The client passes `initializationOptions.typescript.tsdk`. **The project's TypeScript
always wins**: a server that typechecks with a different version than the build produces
diagnostics CI cannot reproduce. Without a usable `tsdk` the server degrades to HTML+CSS
and says so in the log, rather than dying.

## How a request is answered

Source offset → `Mapping` → virtual offset → service → answer → inverse mapping back to the
source. A stretch whose `MappingCaps` does not enable the requested capability does not
route: it answers empty. That is what stops a rename from touching scaffolding.

| Region | Service |
|---|---|
| `@code`, `@server`, `@client`, expressions, control headers, template | TypeScript, over the SDD-23 virtual |
| `<style>` | CSS, over the `.css` virtual |
| HTML markup | HTML |
| `href` of `<link rel="component"\|"layout">` | this package |

## Own requests

- `fudic/virtualFiles` — the virtuals of a document with their text. It exists to debug the
  server while it is being built: without seeing what `tsserver` is being shown, every odd
  diagnostic is debugged blind.
- `fudic/componentRegistry` — the tags a document declares and what they resolve to.

## Invariants

- **Never throws.** Every exception is logged and the request answers empty. A dead server
  leaves the file with no colour and no errors: the worst possible failure.
- **No global state between workspaces.** One process may serve several folders.
- **The mapping is the only route.** No answer is built from virtual offsets.
- **Cancellation is honoured.** Typing fast never queues dead work.

## Not here

The VS Code client, TextMate grammar and packaging (SDD-25); the formatting algorithm
(SDD-26) — the capability is declared and delegated; the generation of the virtuals
(SDD-23); incremental reparsing, workspace-wide diagnostics and refactors.
