# Fudic for VS Code

**IntelliSense for every file of a Fudic app** — `.fud` components and pages, `.fudapi`
contracts, `.fudspec` criteria, the three `.headers` and `fudic.json`. Completion, hovers, go to
definition, references, errors as you type, quick fixes, formatting, snippets and the
workbench, from one extension with its own language server.

Fudic is a UI framework built on standard HTML, CSS and TypeScript: Declarative Shadow DOM,
server rendering and hydration on first interaction. Docs: [fudic.dev](https://fudic.dev).

Also on [Open VSX](https://open-vsx.org/), for Antigravity, Cursor, Windsurf and VSCodium.

## One language, not three

A `.fud` is markup, scoped CSS and a `@code` block in one file. The extension reads it as one
language: the types of the page's `.fudapi` and of `@code` reach the markup, and the markup
answers back. A wrong field in the template is underlined in the `.fud`, on the line you wrote —
not in a generated file you have never seen.

## IntelliSense in a `.fud`

- **Components.** Inside `<my-card |>`, the props that component declares, with their types; an
  expression inside one is completed with its type. `F12` on a tag opens its file; «Find All
  References» lists every use, in your project and in your libraries.
- **Know a component without opening it.** Hover a tag: its description, each prop with type,
  default and doc, its slots, the events it emits and what they carry, its CSS parts and the
  tokens it reads. A component from a library says which one.
- **Page data.** `data.` completes the fields `load` declares in the page's `.fudapi`. `F12` on a
  field opens the contract.
- **Style tokens.** After `var(--`, in a `<style>` or in a `.css` of the project, the tokens of
  your sheets and your libraries', with their value. Hover one to see where it comes from.
- **Links.** Inside `href=""` of a `<link rel="component" | "layout" | "snippet">`, the files
  it can link: yours as relative paths, a library's by its package name.
- **HTML and CSS.** The standard HTML and CSS services, Emmet included (`ul>li*3`).
- **Errors as you type.** The same diagnostics the build gives, with a link to each code's page.
- **Formatting.** Markup, directives, embedded TypeScript and CSS in one pass, on save.
- **Folding and colour.** `@code`, `@if` and `@foreach` fold by their structure. Colour arrives with the first frame and
  is refined by the server: a component tag never looks like a native one.

## IntelliSense in a `.fudapi`

- Completion of every declaration and clause, and of the types of the project.
- **CodeLens.** On line 1, what the file generates (types, server module, browser module) and a
  way to write it again. Over each declaration, the handler that implements it — or
  `not implemented`. One click opens it.
- Hover on rules, `catches` and files; go to definition and references across contracts.

## IntelliSense in a `.fudspec`

- **`Ctrl+K V`** opens the workbench beside the editor: the component or page, its criteria run
  in a real browser on every save, and *Live* to try it by hand. The same button is in the editor
  title of a `.fud`.
- Completion of component tags, routes, terms with their parameters and fixture names.
- Quick fixes that create what a criterion names and does not exist yet: a term module, a
  fixture, a fixture entry.

## `.headers` and `fudic.json`

The three `.headers` (`page.headers`, `sw.headers`, `assets.headers`) get completion, hovers,
errors and quick fixes. `fudic.json` is validated against its JSON Schema: each field completes
and explains itself.

## Quick fixes

The light bulb repairs what it can repair safely. Some of them:

- `Add <link rel="component"> for <app-card>`
- `Add key (item.id)` on a `@foreach`
- `Add the required props of <app-card>` · `Add the layout's required props`
- `Create components/app-card.fud` for a link to a file that does not exist
- `Wrap in @supports selector(…)` for CSS outside your Baseline
- `Silence FUD0123 on this line` · `in this file`, then `Write the reason`

## Snippets

### `.fud`

| Snippet | Writes |
|---|---|
| `component` · `route` · `layout` | the whole file, in an empty document |
| `@if` · `@if else` · `@switch` | a branch |
| `@foreach` · `@for` · `@while` · `@empty` | a loop, and what it renders when it makes no pass |
| `@await` · `@catch` | a part painted when a `later` field arrives, and its failure |
| `@code` · `props` | the code block, and the props contract |
| `link-component` · `link-snippet` · `link-layout` | a `<link>`, with the caret in its `href` |
| `@render` · `@section` | render a snippet; fill a hole of the layout |
| `@RenderBody` · `@RenderHead` · `@RenderSection` | the holes of a layout |
| `beforeHydrate` · `afterHydrate` · `beforeCreate` · `afterCreate` | around hydrating or creating |
| `onConnect` · `onDisconnect` · `onDispose` | each time it enters or leaves the document; once at the end |

Each one is offered only where it fits: `@RenderBody` in a layout, `props` in a component.

### `.fudapi`

| Snippet | Writes |
|---|---|
| `get` · `post` · `put` · `patch` · `delete` | a function |
| `load` | the data of a page |
| `form` | a form and its rules |
| `type` · `enum` · `pattern` | a type, an enum, a named pattern |
| `rule` · `rule remote` | a validation rule; one the browser asks the server while typing |
| `middleware` · `chain` · `use` | a middleware; the ones of every function below; run them |
| `pipe` | a pipe |
| `fails` · `catches` · `invalidates` · `query` · `->` | the clauses of a function |
| `summary` · `validate-on` | the clauses of a form |
| `file argument` · `file field` | a file, with its size and type rules |

### `.fudspec`

| Snippet | Writes |
|---|---|
| `component` · `page` · `flow` | the header line, from where the file is |
| `criterion` | a whole criterion: `given`, `when`, `then` |

## Commands

| Command | What it does |
|---|---|
| `Fudic: Open Workbench` (`Ctrl+K V`) | The workbench of the active `.fud` or `.fudspec`. |
| `Fudic: Format Document` | Formats the active file. |
| `Fudic: Show API Types` | The types the active `.fudapi` generates. |
| `Fudic: Show API Server Module` | The server module it generates. |
| `Fudic: Show API Browser Module` | The browser module it generates. |
| `Fudic: Regenerate API Types` | Writes the generated files again. |
| `Fudic: Restart Language Server` | Re-reads settings, server and TypeScript. After installing a dependency or switching branch. |
| `Fudic: Show Component Registry` | `tag → href → resolved`: why a component does not complete. |
| `Fudic: Show Virtual Files` | What the server shows TypeScript. For debugging. |

## Settings

| Setting | Default | What it does |
|---|---|---|
| `fudic.templateDiagnostics` | `true` | Check the template against its types. |
| `fudic.format.enable` | `true` | Let the extension format `.fud` files. |
| `fudic.workbench.browser` | `auto` | The browser the workbench runs criteria in: Chrome, then Edge, then Playwright's Chromium. |
| `fudic.workbench.workers` | `4` | How many criteria run at once. |
| `fudic.workbench.node` | `null` | The Node that runs the workbench. Empty: the one on the `PATH`. |
| `fudic.trace.server` | `off` | Trace the traffic with the language server. |
| `fudic.server.path` | `null` | Run your own language server instead of the bundled one. |
| `fudic.exposeVirtualFiles` | `false` | Expose the virtual files handed to TypeScript. Debugging only. |

## Status bar

While a Fudic file is active, one item reports the language server. Click it for the **Fudic**
output channel, where the reason is.

| | Meaning |
|---|---|
| `Fudic ✓` | Ready. |
| `Fudic ⟳` | Starting. |
| `Fudic ⚠` | Running without the project's TypeScript: HTML and CSS still work. |
| `Fudic ✕` | Not running. |

## Requirements

- VS Code 1.90 or newer.
- TypeScript installed in the project. The extension always uses the project's version, so the
  editor and the build agree. Without it, markup and CSS still work, and the status bar says so.

Builds are per platform, because the parser and the formatter are native. The marketplace picks
yours.

## Other editors

Everything above but the workbench, the CodeLens commands and the status bar lives in
`@fudic/language-server`, a standard LSP server: `fudic-language-server --stdio`. Neovim, Zed and
any editor with an LSP client can use it.

## Notes

No telemetry. MIT licensed.

Building, running and debugging the extension: **EXTENSION-DEV.md** at the repository root.
