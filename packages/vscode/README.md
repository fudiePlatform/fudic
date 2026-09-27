# Fudic for VS Code

Language support for `.fud` — single-file components built on Declarative Shadow DOM.

A `.fud` file is markup, scoped CSS and a `@code` block in one place. This extension makes
the editor read it as one language instead of three: the types you declare in `@code` reach
the markup, and the markup answers back with completion, hovers and errors.

## Features

**Types across the boundary.** The types in `@code` are the types the template is checked
against. Get the return type of `load()` wrong and the error lands on the expression that
uses it, in the `.fud`, on the line you wrote — not in a generated file you have never seen.

**Component-aware completion.** Typing inside a `<my-card |>` offers the attributes that
component actually declares, and an expression inside one is completed with its type.
`F12` on the tag opens the file that defines it.

**Links that write themselves.** Type `link` and pick one of the three `<link>` fudic reads;
the caret lands in its `href` with the list of what you can link already open:

| Snippet | Writes | Offered |
|---|---|---|
| `link-component` | `<link rel="component" href="">` | top level; in `<head>` of a page or a layout |
| `link-snippet` | `<link rel="snippet" href="">` | same places |
| `link-layout` | `<link rel="layout" href="">` | a file that is not a component yet and names no layout |

Inside `rel=""` the same three are offered. Inside `href=""` the list is the files that link
resolves to: the ones of your own project as relative paths, and the ones of the fudic
libraries you depend on by the name their `exports` give them — `@acme/ui/ui-card.fud`. In a
monorepo, the app next door is not on it.

**Colour that never bleeds.** Highlighting arrives with the first frame, before the language
server has answered, and is corrected by the server about a hundred milliseconds later.
TypeScript inside `@code`, CSS inside `<style>` and the `@` directives are each shown as
what they are.

**Formatting.** Markup, directives, embedded TS and embedded CSS in one pass — from the
palette, or on save.

**The editor conveniences you expect.** `Ctrl+/` produces `@* … *@`, never a `//` that would
not compile. `@code`, `@if` and `@foreach` fold by their own structure.

## Requirements

- VS Code 1.90 or newer.
- TypeScript installed in the project you open. Without it, markup and CSS still work, and
  the status bar says so — types, completion and diagnostics are what go missing.

## Status bar

While a `.fud` is the active file, one item reports the language server:

| | Meaning |
|---|---|
| `Fudic ✓` | Ready. |
| `Fudic ⟳` | Starting. |
| `Fudic ⚠` | Running without the project's TypeScript. HTML and CSS still work. |
| `Fudic ✕` | Not running. |

Click it to open the **Fudic** output channel, where the reason is.

## Commands

| Command | What it does |
|---|---|
| `Fudic: Restart Language Server` | Re-resolves settings, server and TypeScript, then restarts. The answer to a freshly installed dependency or a branch switch. |
| `Fudic: Format Document` | Formats the active `.fud`. |
| `Fudic: Show Virtual Files` | What the server is showing TypeScript. For debugging. |
| `Fudic: Show Component Registry` | `tag → href → resolved`. Answers "why does my component not complete". |

## Settings

| Setting | Default | What it does |
|---|---|---|
| `fudic.templateDiagnostics` | `true` | Check the template against the types declared in `@code`. |
| `fudic.format.enable` | `true` | Let the extension format `.fud` files. |
| `fudic.trace.server` | `off` | Trace the traffic between the editor and the language server. |
| `fudic.server.path` | `null` | Run your own language server instead of the bundled one. |
| `fudic.exposeVirtualFiles` | `false` | Expose the virtual files handed to TypeScript. Debugging only. |

## Notes

The extension carries its own language server; nothing else needs installing. All the
language intelligence lives in that server, which is editor-agnostic on purpose — this
package contributes only what an editor cannot delegate: the grammar, the language
configuration, the commands and the status bar.

Builds are per platform, because the parser and the formatter are native addons. Install the
build for your own.

No telemetry.

## Contributing

Building, running and debugging the extension: **EXTENSION-DEV.md** at the repository root.
