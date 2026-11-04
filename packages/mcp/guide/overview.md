# overview

What fudic is, the files a project holds, how an app, a library and a workspace are laid out,
and which guide topics exist.

## What fudic is

- **A UI framework on Declarative Shadow DOM.** A component is a custom element whose markup is
  its own tag wrapping a `<template shadowrootmode="open">`. The browser attaches the shadow
  root while it parses the HTML, before any script runs.
- **HTML first.** Every page is rendered to HTML: prerendered at build time, rendered by the
  server on request, or by the Service Worker during navigation. A page that has nothing
  interactive ships no JavaScript of its own; the hydration runtime is only added to a page
  that has something to hydrate.
- **JavaScript only where it is needed.** A component hydrates when it has state, events or
  reactive props. Everything else stays plain HTML and CSS.
- **fudic is a BFF, never the backend.** A `.fudapi` declares what a view needs from the
  server. Each function has a handler in `src/server` that **translates** between that
  contract and the real backend: call it, convert its answer to the `.fudapi` type, turn its
  errors into the declared failures. No business logic and no persistence go in a handler;
  they belong to the backend.
- **Not React, not Vue.** There is no JSX, no virtual DOM, no `useState`. The markup is strict
  HTML with `@` constructs, and the view is a closed list of expressions the compiler checks.
  Never write fudic by analogy with another framework: read the topic first.

## The files

| File | What it is for |
|---|---|
| `.fud` | A component, a page, a route, a layout or a snippet file. HTML with `@` constructs, one scoped `<style>`, an optional `@code { … }` block. See `components` and `pages`. |
| `.fudapi` | The server contract of one route or component: its `load`, its functions, its types, its forms and rules, what each can fail with. Its handlers are TypeScript in `src/server`. See `fudapi`. |
| `.fudspec` | Acceptance criteria of one component, in plain steps (`given`, `when`, `then`), run in a real browser. The user approves them. See `fudspec`. |
| `.fixture.ts` | Named sets of props that the criteria mount the component with (`props base`). Typed against the component's `$Props`. |
| `.test.ts` | Unit tests (Vitest, in-process DOM): every prop variant, edge values, event details, server functions and their failures. See `testing`. |
| `.fudlog` | The history of one piece, next to its `.fud`: approvals, test and criteria runs with their result, `done`. It only grows. Written by the tools, never by hand. |
| `fudic.json` | What a project declares about itself: `kind` (`app` or `lib`), `id`, tag `prefix`, `globalStyles`, `styles`, `locales`, and the `server` and `browser` folders. |
| `sw.json` | What the Service Worker caches. Delete it for no Service Worker. |

Generated files, never edited: `fudic-globals.d.ts`, `src/fudic-env.d.ts`, and everything under
`.fudic/` (ignored by git; the types generated from each `.fudapi` live in `.fudic/api`).

The `fudic.json` of a new app called `app`:

```json path=fudic.json
{
  "id": "app",
  "kind": "app",
  "prefix": "app",
  "server": "src/server",
  "browser": "src/browser"
}
```

- `id` names the Service Worker's caches. **Never change it** once the app has been visited.
- `prefix` turns a component name into its tag: `card` becomes `<app-card>`.

## A standalone app

What `fudic_new { name: "app" }` creates (`fudic new app` on the command line):

```text
app/
├── fudic.json            id, kind, prefix, server and browser folders
├── package.json          scripts: dev, build, preview, test, spec
├── sw.json               Service Worker cache policy
├── vite.config.ts        the fudic() plugin; nothing else to configure
├── vitest.config.ts      unit tests
├── tsconfig.json
├── fudic-globals.d.ts    generated
├── .gitattributes        *.fudlog merge=union
├── .gitignore
├── README.md
└── src/
    ├── fudic-env.d.ts    generated
    ├── layouts/
    │   ├── _layout.fud       the frame every page renders into
    │   └── _layout.test.ts
    ├── routes/
    │   ├── index.fud         the page at /
    │   └── index.test.ts
    ├── server/           handlers of the .fudapi functions (empty)
    └── browser/          code that runs in the browser (empty)
```

Pieces you add with `fudic_generate` land here:

| Kind | Where |
|---|---|
| `component` | `src/components/<tag>/`: `<tag>.fud`, `<tag>.test.ts`, `<tag>.fudspec`, `<tag>.fixture.ts` |
| `page` | `src/routes/<path>.fud` and its `.test.ts`. The path is the URL: `blog/:slug` |
| `layout` | `src/layouts/<name>.fud` and its `.test.ts` |
| `snippet` | `src/snippets/<file>.fud` and its test |
| `api` | `<piece>.fudapi` beside the `.fud`, its handler in `src/server`, and the `<link rel="server">` in the `.fud` |
| `style` | `<name>.css` at the project root, listed under `globalStyles` in `fudic.json` |
| `pipe` | `src/pipes/` |

The home page a new app starts with:

```fud path=src/routes/index.fud
<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Home</title>
</head>

<h1>Home</h1>
```

## Where server handlers go

A `.fudapi` has an `<id>`: its path inside `src/`, without the extension. Its handler is the
TypeScript file with the same id under the `server` folder of `fudic.json` (`src/server` by
default):

| `.fud` | `.fudapi` | Handler |
|---|---|---|
| `src/routes/about.fud` | `src/routes/about.fudapi` | `src/server/routes/about.ts` |
| `src/components/app-cart/app-cart.fud` | `src/components/app-cart/app-cart.fudapi` | `src/server/components/app-cart/app-cart.ts` |

Never create these three files by hand: `fudic_generate { kind: "api", … }` writes the `.fudapi`,
the handler and the link together. `fudic_contract { id }` tells you each handler still to write,
with its TypeScript signature. A library's server is not generated yet (`FUD1241`).

## A component

One folder per component, four files. This is a finished one, documented:

```fud path=src/components/app-card/app-card.fud
@code {
  /**
   * A card with a title. Whatever is written inside the tag fills its default slot, under the
   * title.
   */
  const { title } = props<{
    /** The heading of the card: one short line. */
    title: string;
  }>();
}

<head>
  <style>
    .card {
      border: 1px solid #dcdcdc;
      border-radius: 10px;
      padding: 1rem 1.15rem;
      h2 {
        margin: 0 0 0.35rem;
        font-size: 1.05rem;
      }
    }
  </style>
</head>

<app-card>
  <template shadowrootmode="open">
    <article class="card">
      <h2>@title</h2>
      <slot></slot>
    </article>
  </template>
</app-card>
```

```ts path=src/components/app-card/app-card.fixture.ts
import type { Fixtures } from '@fudic/terms';
import type { $Props } from './app-card.fud';

export default {
  base: { title: 'A card' },
} satisfies Fixtures<$Props>;
```

```fudspec path=src/components/app-card/app-card.fudspec
component app-card

criterion renders
  given
    props base
  then
    present app-card
```

## A workspace

Several apps and the libraries they share, in one pnpm repo. `fudic_new { name: "shop",
workspace: true, app: "web", lib: "ui" }` (`fudic new shop --workspace --app web --lib ui`):

```text
shop/
├── package.json          dev, preview, build, test, spec for every project
├── pnpm-workspace.yaml   apps/* and libs/*
├── tsconfig.base.json
├── fudic-globals.d.ts
├── .gitattributes
├── apps/
│   └── web/              an app, as above; package @shop/web, served at /
└── libs/
    └── ui/               a library; package @shop/ui, tag prefix ui-
```

- The first app is served at `/`, every other one at `/<name>/`.
- A library lives in a workspace. A standalone app has none beside it.
- `fudic_add { module: "ui", project: "web" }` makes an app use a library of the workspace.

## A library

Components other projects use. It is not served: no routes, no layout, no `vite.config.ts`,
no `sw.json`, no `id`.

```text
libs/ui/
├── fudic.json            { "kind": "lib", "prefix": "ui" }
├── package.json          exports the .fud sources, not a build
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── src/
    ├── fudic-env.d.ts
    └── components/       one folder per component, as in an app
```

An app links a library's component by package name:
`<link rel="component" href="@shop/ui/ui-card.fud">`. Before using one, call `fudic_describe`
with its tag; never open its file.

A **style library** (`fudic_generate { kind: "lib", name: "tokens", stylesOnly: true }`) holds a
single `tokens.css` and nothing else: design tokens every component of its users adopts. See
`html-css`.

## The guide topics

Call `fudic_guide { topic }` before writing a kind of file for the first time.

| Topic | Read it before |
|---|---|
| `overview` | anything: this page |
| `workflow` | starting any piece: the phases, who approves what, the check and fix loop |
| `components` | writing a component `.fud`: its shape, props, slots, events, forms |
| `pages` | writing a route, a page or a layout: params, `load`, layouts, sections, sessions |
| `view` | writing any `@` expression, condition or loop: what the view may write |
| `fudapi` | writing a `.fudapi` or its handlers |
| `fudspec` | writing criteria and fixtures |
| `testing` | writing a `.test.ts` |
| `html-css` | writing markup or styles: the HTML subset, scoping, tokens |
| `FUD0540` (any code) | fixing that diagnostic: what is wrong and how to fix it |
