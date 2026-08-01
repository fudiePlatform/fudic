# Developing the VS Code extension

Two ways to run `fudic-vscode` from this repo. Pick by what you are doing:

| | For | Cost |
|---|---|---|
| **Run from source** (`F5`) | Working on the extension or the server | None — `Ctrl+R` reloads |
| **Install the `.vsix`** | Writing `.fud` while you work on something else | Reinstall after each change |

## Prerequisites

Node `>=22.12` (see `.nvmrc`), pnpm 11 via Corepack, VS Code `>=1.90`.

The `code` command is needed only to install the `.vsix`. If it is not on your `PATH`:
**Ctrl+Shift+P → "Shell Command: Install 'code' command in PATH"**.

## Run from source

```sh
pnpm install
```

Open the repo root in VS Code and press **`F5`**. It builds first, then opens a second
window with your extension loaded from source, on `packages/language-server/fixtures` — a
real project: a route with `@code`/`@server`, a layout and two components.

Open `blog/[slug].fud`. It should have colour instantly, and `Fudic ✓` should appear in the
status bar.

### The edit loop

```sh
pnpm --filter fudic-vscode dev      # rolldown, watching
```

Then `Ctrl+R` in the development window after each change. That reloads the client *and*
relaunches the server, so both pick up the new bundles.

The watch does not rebuild the sibling packages. If you touch `packages/language-server/src`
or `packages/compiler/src`, run `pnpm --filter "fudic-vscode..." build` and reload — the
three dots mean *the package and its dependencies*, and the bundles are assembled from their
`dist`, not from their sources.

Working on the server alone has a shorter loop: point `fudic.server.path` at
`packages/language-server/bin/fudic-language-server.js` in your settings, rebuild just that
package, and run **Fudic: Restart Language Server**. No reload, no repackaging. If the path
is wrong the extension says so and falls back to the bundled server.

### Debugging

Breakpoints in `packages/vscode/src/` work under `F5`. For the server, launch the compound
**Fudic: extension + server** — it attaches to port 6009, where the client forks the server
while the host is being debugged.

## Install the `.vsix`

```sh
pnpm --filter fudic-vscode install:vsix
```

Builds, verifies, packages, installs. Then reload the window and open any `.fud`. Run it
again after any change; it overwrites the installed version.

It checks for `code` up front, because that is the prerequisite that is missing most often
and the build takes a minute. The verify step asks `vsce` what would be packaged and fails
if anything required is missing — the failure it prevents is silent: a `.vscodeignore`
pattern that drops something needed produces a package that installs, activates and then
does nothing at all.

> The `.vsix` carries native binaries for the machine that built it — a package built on
> Windows will not work on Linux. Irrelevant locally; releases go out per target
> (`vsce package --target win32-x64`, …).

To confirm, or to undo:

```sh
code --list-extensions --show-versions   # fudic.fudic-vscode@0.0.1
code --uninstall-extension fudic.fudic-vscode
```

## Check it works

On `packages/language-server/fixtures/blog/[slug].fud`:

| What | What you should see |
|---|---|
| Colour | TS inside `@code`, CSS inside `<style>`, `@section` and `@if` all distinct |
| Completion | Inside `<app-badge \|>`, `tone` is offered |
| Types | Inside `tone="@(\|)"`, `'neutral' \| 'success' \| 'info'` are offered |
| Hover | Over `tone`, the type `Tone` |
| Go to definition | `F12` on `<app-badge>` opens `components/app-badge.fud` |
| Diagnostics | Break the return of `load()`: the error lands **on `@data.body`**, in the `.fud` |
| Comments | `Ctrl+/` over markup produces `@* … *@` |
| Formatting | **Fudic: Format Document** lays out markup, TS and CSS |

## When it doesn't

**`Fudic ⚠`** — the server started without the project's TypeScript. It looks for
`typescript.tsdk`, then the workspace's `node_modules`, then falls back to the one VS Code
ships, which is marked degraded on purpose: typechecking against a different version
produces diagnostics CI cannot reproduce. Install `typescript` in the project you opened and
restart the server.

**`Fudic ✕`** — the server did not start after three tries. Click the status item: the
reason is in the output channel. Usually a `fudic.server.path` pointing at a `dist` that was
never built.

**No colour at all** — check the language is recognised as *Fudic* (bottom right), and that
`packages/vscode/dist/extension.cjs` exists. If it does not, the build did not run.

**Want the wire traffic** — set `"fudic.trace.server": "verbose"`. It goes to the Fudic
output channel.

> A freshly cloned tree fails `pnpm typecheck` until it has been built once: packages are
> typechecked against their siblings' `dist`. Run `pnpm build` first.

## Where things are

| Path | What |
|---|---|
| `packages/vscode/src/` | The client. Everything goes through ports; only `extension.ts` imports `vscode` |
| `packages/vscode/syntaxes/` | The TextMate grammar — the colour of the first frame |
| `packages/vscode/language-configuration.json` | Comments, brackets, folding |
| `packages/vscode/docs/verificacion-manual.md` | What only a human in a live editor can check |
| `packages/language-server/` | The language server, editor-agnostic |

Two things about this package differ from the rest of the repo. It builds to **CommonJS**,
because VS Code loads `main` with `require`, so Rolldown emits the bundle and `tsc` only
typechecks. And **`vscode` is aliased in tests** to `test/_vscode-stub.ts`: the module only
exists inside the extension host, so every module takes the API it needs as a parameter and
`extension.ts` is the only file that imports it directly.
