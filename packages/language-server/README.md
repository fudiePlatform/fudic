# `@fudic/language-server`

The LSP server for `.fud` files (SDD-24). It is **plumbing**: every answer comes from the
virtual projection of [`@fudic/language-core`](../language-core) (SDD-23) and from services
that already exist — TypeScript, HTML and CSS. This package decides how they are assembled,
which requests are served, and when state is thrown away.

Editor-agnostic by design, not by taste: the same binary serves VS Code (SDD-25), Neovim and
any editor with an LSP client. Nothing from `vscode-*` beyond the protocol packages enters here.

## Running it

```sh
fudic-language-server --stdio
fudic-language-server --node-ipc
fudic-language-server --socket=6009
```

The client passes `initializationOptions.typescript.tsdk`, the absolute path of the project's
`node_modules/typescript/lib`. **The project's TypeScript always wins**: a server that
typechecks with a different version than the build produces diagnostics CI cannot reproduce.
Without a usable `tsdk` it takes the TypeScript this package depends on; if even that cannot be
loaded, it degrades to HTML+CSS and says so in the log, rather than dying.

Neovim 0.11:

```lua
vim.filetype.add({ extension = { fud = 'fudic', fudapi = 'fudapi', fudspec = 'fudspec' } })

vim.lsp.config('fudic', {
  cmd = { 'fudic-language-server', '--stdio' },
  filetypes = { 'fudic', 'fudapi', 'fudspec' },
  root_markers = { 'fudic.json', 'package.json' },
  before_init = function(params, config)
    params.initializationOptions = {
      typescript = { tsdk = config.root_dir .. '/node_modules/typescript/lib' },
    }
  end,
})
vim.lsp.enable('fudic')
```

## How a request is answered

Source offset → `Mapping` → virtual offset → service → answer → inverse mapping back to the
source. A stretch whose `MappingCaps` does not enable the requested capability does not
route: it answers empty. That is what stops a rename from touching scaffolding.

| Region | Service |
|---|---|
| `@code`, expressions, control headers, template | TypeScript, over the SDD-23 virtual |
| `<style>` | CSS, over the `.css` virtual |
| HTML markup | HTML |
| `href` of `<link rel="component"\|"layout">` | this package |

## The other files

The same server answers the rest of a Fudic app, each file with its own service:

- **`.fudapi`** — completion, hover, definition, references, CodeLens (what it generates, who
  implements each declaration), quick fixes and semantic tokens.
- **`.fudspec`** — completion of tags, routes, terms and fixtures; quick fixes that create a term
  module or a fixture; semantic tokens.
- **`page.headers`, `sw.headers`, `assets.headers`** — diagnostics, completion, hover and quick
  fixes, from the same parser the build uses.
- **`fudic.json`** — diagnostics and quick fixes for `baseline` and `diagnostics`; its JSON
  Schema is the client's.

## Own requests

- `fudic/virtualFiles` — the virtuals of a document with their text. It exists to debug the
  server while it is being built: without seeing what `tsserver` is being shown, every odd
  diagnostic is debugged blind.
- `fudic/componentRegistry` — the tags a document declares and what they resolve to.

## Repairs without an editor

`@fudic/language-server/repairs` is the light bulb as data. Give it a parsed file, the workspace
index and, when there is one, the project's TypeScript:

```ts
import { repairsFor } from '@fudic/language-server/repairs';

repairsFor({ cached, index, typescript }, diagnostic);
// [{ title: 'Add key (item.id)', code: 'FUD0540', edits: [{ path, span, newText: ' key (item.id)' }] }]
```

Several repairs means the author chooses; none means no repair is safe. The editor's bulb is an
adapter of this same table.

## Invariants

- **Never throws.** Every exception is logged and the request answers empty. A dead server
  leaves the file with no colour and no errors: the worst possible failure.
- **No global state between workspaces.** One process may serve several folders.
- **The mapping is the only route.** No answer is built from virtual offsets.
- **Cancellation is honoured.** Typing fast never queues dead work.

## Not here

The VS Code client, TextMate grammar, workbench and packaging (SDD-25); the formatting
algorithm, which is `@fudic/formatter`'s (SDD-26) — the server routes the three formatting
requests to it; the generation of the virtuals (SDD-23); incremental reparsing, workspace-wide
diagnostics and refactors.
