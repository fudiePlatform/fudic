# `fudic-vscode`

The VS Code client for `.fud` files (SDD-25). **Thin by design: zero language logic.** It
registers the language, starts the server from
[`@fudic/language-server`](../language-server) (SDD-24), and contributes the things that
can only live on the client — the TextMate grammar that colours the first frame, the
language configuration, and the commands.

The rule that governs this package: *if something can live in the server, it lives in the
server*. Every line of intelligence that leaks in here is a line Zed and Neovim will not
have.

## What is client-only, and why

| Piece | Why it cannot live in the server |
|---|---|
| TextMate grammar | Colours before the server has answered. It is **data**, not code. |
| `language-configuration.json` | Comments, brackets, folding: the editor reads it directly. |
| Commands, status bar | The editor's own UI surface. |
| Starting the process, resolving the `tsdk` | Only the client knows the workspace's TypeScript. |

The grammar is **deliberately approximate** on `@` transitions — real disambiguation needs
the delimiter balancer (SDD-02), which no regular expression can express. The server's
semantic tokens correct it about a hundred milliseconds later. The bar the grammar has to
clear is *no bleed*: broken colour must never propagate to the end of the file.

## Layout

```
src/          the client — every module takes the host API through a port
test/         Vitest specs; `_vscode-stub.ts` is the double for the `vscode` module
syntaxes/     fudic.tmLanguage.json — the grammar
fixtures/     frozen .fud corpus the grammar tests tokenise
docs/         the manual verification script for what no suite can check
```

## Two things that differ from every other package here

**It builds to CommonJS.** VS Code loads `main` as CJS; this repo is ESM with
`verbatimModuleSyntax`. The source stays TS/ESM and Rolldown emits `dist/extension.cjs`.
That is why this package has no `tsconfig.build.json`: `tsc` only typechecks, and `build`
is the bundle.

**`vscode` is aliased in tests.** The module only exists inside the extension host. All of
`src/` takes the API it needs as a parameter, and `src/extension.ts` is the only file that
imports `vscode` — an adapter with no branches. Under Vitest that import resolves to
`test/_vscode-stub.ts`, so even the adapter loads and counts. Without that rule either the
package never reaches 100 %, or its 100 % means nothing.

## Commands

| Command | What it is for |
|---|---|
| `Fudic: Reiniciar el servidor de lenguaje` | The escape valve for stale state no watcher saw. |
| `Fudic: Ver ficheros virtuales` | What the server is actually showing `tsserver`. Daily debugging. |
| `Fudic: Ver registro de componentes` | `tag → href → resolved`. Answers "why does my component not complete". |
| `Fudic: Formatear documento` | Formats through the server (SDD-26). |

No telemetry.
