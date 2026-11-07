# `@fudic/example-workspace`

Two fudic applications published on **one origin**, and two libraries they share.

```
apps/tienda   →  /         id "tienda"
apps/admin    →  /admin/   id "tienda-admin"

libs/guia     the style guide, no components  ← libs/ui ← both apps
libs/ui       ui-card, .fud source, no dist
```

They are two projects, not two configurations of one: each has its own `package.json`,
its own dependencies, its own `src/` and its own build. What they share they share the
way any project shares code — by depending on a package.

## The libraries

A fudic library publishes **`.fud` source**, not a build. There is no `vite.config.ts`
and no `dist` in either of them: the contract of a component — its props, its slots,
whether it hydrates — is derived from the AST, and two of those are properties of the
consumer's whole graph, so there is nothing to precompile. `package.json` points `exports`
and `files` at the sources, and whoever consumes them compiles them with their own
compiler. That is why `libs/ui` declares the compiler it was written for as a
`peerDependency`: a build that resolves a compiler outside that range gets a warning,
because what a mismatch produces is a syntax error in a file you did not write.

Both apps link the same component by package name:

```html
<link rel="component" href="@fudic/example-ui/ui-card.fud">
```

and it comes out **identical in both**.

`libs/guia` is the style guide. Every page of both apps links `guide.css` — the tokens on
`:root`, the document's reset and a few pieces — pruned to what the page uses, without a
`<link>` in any source: the apps reach it through `libs/ui`, which depends on it. A component
adopts the global sheets of the chain of the package that defines it, then the pieces it names:

```
ui-card        →  data-fud-adopt="base ui h2 ui-card"
tienda-card    →  data-fud-adopt="base ui h2 tienda-card"
admin-panel    →  data-fud-adopt="base ui admin h2 admin-panel"
```

The two apps set `--guia-accent` to their own colour, each for the components it defines, and
the shared card keeps the guide's blue in both. The storefront does it in the page
(`src/tienda.css`, linked by its layout, on the `tienda-card` host); the back office in a sheet
its own components adopt (`src/admin.css`, `:host`). A token set on an element of the page
reaches every component under it — that is how a zone is themed — and a library's component
is only retinted by whoever sets the custom properties it reads.

## Run it

From the repo root:

```sh
pnpm install
pnpm build                                       # packages, then both apps
pnpm --filter @fudic/example-workspace serve     # http://localhost:4373
```

The two apps are workspace members of their own (`examples/workspace/apps/*` in
`pnpm-workspace.yaml`), so `pnpm build` at the root builds them, in dependency order,
like any other project. This package deliberately has **no** `build` script: an
aggregate one here would be a second way to build the same two apps, and — because this
package declares none of the `@fudic/*` it would be building — `pnpm -r` could order it
before the packages it needs, which on a clean checkout it did. The `apps` script runs
just the two, for when that is what you want.

`/` is the storefront and `/admin/` is the back office. Each registers its own Service
Worker, scoped to its own directory.

## Made with the CLI

The tree is the one `fudic` writes: `fudic new --workspace --app tienda`, `g guide guia`
(trimmed to a few pieces and the system font), `g lib ui --uses guia`, `g app admin --uses ui`,
`g style` and `g component` for each project. So every component sits in its own folder with its unit test,
its `.fudspec` and its fixture, and every project runs them:

```sh
pnpm --filter @fudic/example-ui test      # or example-tienda, example-admin
pnpm --filter @fudic/example-ui spec
```

What the CLI does not write is the content: the pages, the components and their styles.

## The end-to-end suite

```sh
pnpm --filter @fudic/example-workspace test:e2e
```

It builds both apps, serves them on one origin and drives the browser through the case
the origin exists to show: visit one app, visit the other, cut the network, go back to
the first. Both open.

`serve.mjs` is what makes that possible — a static server that mounts two independent
builds side by side, the way a reverse proxy or a static host does. Two ports would not
do: `CacheStorage` belongs to the origin, so two origins have two of them and there is
nothing left to observe.

## Check it by hand

With both apps served, open DevTools → Application → Cache Storage:

```
shell-tienda-<build>          routes-tienda-<build>          …
shell-tienda-admin-<build>    routes-tienda-admin-<build>    …
```

Eight caches, four per application, and the application's `id` is the middle segment.
Visiting one app must never make the other's disappear.
