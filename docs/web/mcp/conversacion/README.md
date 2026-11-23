# Conversación real con el MCP

Grabada el 2026-11-23: un Claude Code nuevo (`claude -p`), sin más contexto que el proyecto que deja `fudic new tienda`, con `@fudic/*` instalado desde el Verdaccio local. Cada llamada al MCP va con su respuesta entera; las lecturas y escrituras de ficheros del agente, solo nombradas. Fuente de la página «Una conversación de principio a fin».

## Turno 1

**Persona:** Quiero tres componentes para mi tienda: un botón, una tarjeta de producto y un campo de texto. ¿Por dónde empezamos?

**Modelo:** Voy a empezar consultando el estado del proyecto fudic, como indica el framework.

*(ToolSearch)*

**Llamada:** `fudic_status` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "phase": "criteria",
 "project": {
  "name": "tienda",
  "kind": "app",
  "prefix": "tienda",
  "errorPage": {
   "from": "none"
  }
 },
 "summary": {
  "errors": 0,
  "warnings": 0
 },
 "units": [
  {
   "piece": "src/routes/index.fud",
   "kind": "route",
   "name": "/",
   "phase": "criteria",
   "approval": "none",
   "server": false,
   "tests": "not run",
   "spec": "not run",
   "documented": "0/0",
   "functions": {
    "connected": 0,
    "missing": 0
   }
  }
 ],
 "diagnostics": [],
 "next": "Ask the user for what the page shows and does of /. Propose them, wait for their approval, then write src/routes/index.fudspec and its fixture, and call fudic_record { piece: \"src/routes/index.fud\", event: \"approved\" }. Call fudic_guide { topic: \"fudspec\" } first."
}
```

**Modelo:** Proyecto `tienda` (app, prefijo `tienda`), sin errores, con una sola ruta `/` en fase `criteria`. Voy a leer la guía antes de proponer nada.

**Llamada:** `fudic_guide` 

```json
{
 "topic": "overview"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "overview",
 "related": [
  "workflow",
  "components",
  "pages",
  "view",
  "fudapi",
  "fudspec",
  "testing",
  "html-css",
  "config"
 ],
 "body": "# overview\n\nWhat fudic is, the files a project holds, how an app, a library and a workspace are laid out,\nand which guide topics exist.\n\n## What fudic is\n\n- **A UI framework on Declarative Shadow DOM.** A component is a custom element whose markup is\n  its own tag wrapping a `<template shadowrootmode=\"open\">`. The browser attaches the shadow\n  root while it parses the HTML, before any script runs.\n- **HTML first.** Every page is rendered to HTML: prerendered at build time, rendered by the\n  server on request, or by the Service Worker during navigation. A page that has nothing\n  interactive ships no JavaScript of its own; the hydration runtime is only added to a page\n  that has something to hydrate.\n- **JavaScript only where it is needed.** A component hydrates when it has state, events,\n  reactive props or lifecycle hooks (`afterHydrate`, `onConnect`…); a route with hooks ships\n  JavaScript too. Everything else stays plain HTML and CSS.\n- **fudic is a BFF, never the backend.** A `.fudapi` declares what a view needs from the\n  server. Each function has a handler in `src/server` that **translates** between that\n  contract and the real backend: call it, convert its answer to the `.fudapi` type, turn its\n  errors into the declared failures. No business logic and no persistence go in a handler;\n  they belong to the backend.\n- **Not React, not Vue.** There is no JSX, no virtual DOM, no `useState`. The markup is strict\n  HTML with `@` constructs, and the view is a closed list of expressions the compiler checks.\n  Never write fudic by analogy with another framework: read the topic first.\n\n## The files\n\n| File | What it is for |\n|---|---|\n| `.fud` | A component, a page, a route, a layout or a snippet file. HTML with `@` constructs, one scoped `<style>`, an optional `@code { … }` block. See `components` and `pages`. |\n| `.fudapi` | The server contract of one route or component: its `load`, its functions, its types, its forms and rules, what each can fail with. Its handlers are TypeScript in `src/server`. See `fudapi`. |\n| `.fudspec` | Acceptance criteria of one component, in plain steps (`given`, `when`, `then`), run in a real browser. The user approves them. See `fudspec`. |\n| `.fixture.ts` | Named sets of props that the criteria mount the component with (`props base`). Typed against the component's `$Props`. |\n| `.test.ts` | Unit tests (Vitest, in-process DOM): every prop variant, edge values, event details, server functions and their failures. See `testing`. |\n| `.fudlog` | The history of one piece, next to its `.fud`: approvals, test and criteria runs with their result, `done`. It only grows. Written by the tools, never by hand. |\n| `fudic.json` | What a project declares about itself. Every key, its default and an example: see `config`. |\n| `sw.json` | What the Service Worker caches. Delete it for no Service Worker. See `config`. |\n| `page.headers`, `sw.headers`, `assets.headers` | The headers of an app's pages (its CSP among them), of its Service Worker and of its static files. What is in them is what is sent. See `config`. |\n\nGenerated files, never edited: `fudic-globals.d.ts`, `src/fudic-env.d.ts`, and everything under\n`.fudic/` (ignored by git; the types generated from each `.fudapi` live in `.fudic/api`).\n\nThe `fudic.json` of a new app called `app`:\n\n```json path=fudic.json\n{\n  \"id\": \"app\",\n  \"kind\": \"app\",\n  \"prefix\": \"app\",\n  \"server\": \"src/server\",\n  \"browser\": \"src/browser\"\n}\n```\n\n- `id` names the Service Worker's caches. **Never change it** once the app has been visited.\n- `prefix` turns a component name into its tag: `card` becomes `<app-card>`.\n\n## A standalone app\n\nWhat `fudic_new { name: \"app\" }` creates (`fudic new app` on the command line):\n\n```text\napp/\n├── fudic.json            id, kind, prefix, server and browser folders\n├── package.json          scripts: dev, build, preview, test, spec\n├── sw.json               Service Worker cache policy\n├── page.headers          the headers of every page: CSP, HSTS, COOP…\n├── sw.headers            the headers of /fudic-sw.js\n├── assets.headers        the cache of the static files, by path\n├── vite.config.ts        the fudic() plugin; nothing else to configure\n├── vitest.config.ts      unit tests\n├── tsconfig.json\n├── fudic-globals.d.ts    generated\n├── .gitattributes        *.fudlog merge=union\n├── .gitignore\n├── README.md\n└── src/\n    ├── fudic-env.d.ts    generated\n    ├── layouts/\n    │   ├── _layout.fud       the frame every page renders into\n    │   └── _layout.test.ts\n    ├── routes/\n    │   ├── index.fud         the page at /\n    │   └── index.test.ts\n    ├── server/           handlers of the .fudapi functions (empty)\n    └── browser/          code that runs in the browser (empty)\n```\n\nPieces you add with `fudic_generate` land here:\n\n| Kind | Where |\n|---|---|\n| `component` | `src/components/<tag>/`: `<tag>.fud`, `<tag>.test.ts`, `<tag>.fudspec`, `<tag>.fixture.ts` |\n| `page` | `src/routes/<path>.fud` and its `.test.ts`. The path is the URL: `blog/:slug` |\n| `layout` | `src/layouts/<name>.fud` and its `.test.ts` |\n| `snippet` | `src/snippets/<file>.fud` and its test |\n| `api` | `<piece>.fudapi` beside the `.fud`, its handler in `src/server`, and the `<link rel=\"server\">` in the `.fud` |\n| `style` | `<name>.css` at the project root, listed under `globalStyles` in `fudic.json` |\n| `pipe` | `src/pipes/` |\n\nThe home page a new app starts with:\n\n```fud path=src/routes/index.fud\n<link rel=\"layout\" href=\"../layouts/_layout.fud\">\n\n<head>\n  <title>Home</title>\n</head>\n\n<h1>Home</h1>\n```\n\n## Where server handlers go\n\nA `.fudapi` has an `<id>`: its path inside `src/`, without the extension. Its handler is the\nTypeScript file with the same id under the `server` folder of `fudic.json` (`src/server` by\ndefault):\n\n| `.fud` | `.fudapi` | Handler |\n|---|---|---|\n| `src/routes/about.fud` | `src/routes/about.fudapi` | `src/server/routes/about.ts` |\n| `src/components/app-cart/app-cart.fud` | `src/components/app-cart/app-cart.fudapi` | `src/server/components/app-cart/app-cart.ts` |\n\nNever create these three files by hand: `fudic_generate { kind: \"api\", … }` writes the `.fudapi`,\nthe handler and the link together. `fudic_contract { id }` tells you each handler still to write,\nwith its TypeScript signature. A library's server is not generated yet (`FUD1241`).\n\n## A component\n\nOne folder per component, four files. This is a finished one, documented:\n\n```fud path=src/components/app-card/app-card.fud\n@code {\n  /**\n   * A card with a title. Whatever is written inside the tag fills its default slot, under the\n   * title.\n   */\n  const { title } = props<{\n    /** The heading of the card: one short line. */\n    title: string;\n  }>();\n}\n\n<head>\n  <style>\n    .card {\n      border: 1px solid #dcdcdc;\n      border-radius: 10px;\n      padding: 1rem 1.15rem;\n      h2 {\n        margin: 0 0 0.35rem;\n        font-size: 1.05rem;\n      }\n    }\n  </style>\n</head>\n\n<app-card>\n  <template shadowrootmode=\"open\">\n    <article class=\"card\">\n      <h2>@title</h2>\n      <slot></slot>\n    </article>\n  </template>\n</app-card>\n```\n\n```ts path=src/components/app-card/app-card.fixture.ts\nimport type { Fixtures } from '@fudic/terms';\nimport type { $Props } from './app-card.fud';\n\nexport default {\n  base: { title: 'A card' },\n} satisfies Fixtures<$Props>;\n```\n\n```fudspec path=src/components/app-card/app-card.fudspec\ncomponent app-card\n\ncriterion renders\n  given\n    props base\n  then\n    present app-card\n```\n\n## A workspace\n\nSeveral apps and the libraries they share, in one pnpm repo. `fudic_new { name: \"shop\",\nworkspace: true, app: \"web\", lib: \"ui\" }` (`fudic new shop --workspace --app web --lib ui`):\n\n```text\nshop/\n├── package.json          dev, preview, build, test, spec for every project\n├── pnpm-workspace.yaml   apps/* and libs/*\n├── tsconfig.base.json\n├── fudic-globals.d.ts\n├── .gitattributes\n├── apps/\n│   └── web/              an app, as above; package @shop/web, served at /\n└── libs/\n    └── ui/               a library; package @shop/ui, tag prefix ui-\n```\n\n- The first app is served at `/`, every other one at `/<name>/`.\n- A library lives in a workspace. A standalone app has none beside it.\n- `fudic_add { module: \"ui\", project: \"web\" }` makes an app use a library of the workspace.\n\n## A library\n\nComponents other projects use. It is not served: no routes, no layout, no `vite.config.ts`,\nno `sw.json`, no `id`.\n\n```text\nlibs/ui/\n├── fudic.json            { \"kind\": \"lib\", \"prefix\": \"ui\" }\n├── package.json          exports the .fud sources, not a build\n├── tsconfig.json\n├── vitest.config.ts\n├── README.md\n└── src/\n    ├── fudic-env.d.ts\n    └── components/       one folder per component, as in an app\n```\n\nAn app links a library's component by package name:\n`<link rel=\"component\" href=\"@shop/ui/ui-card.fud\">`. Before using one, call `fudic_describe`\nwith its tag; never open its file.\n\nA **style library** (`fudic_generate { kind: \"lib\", name: \"tokens\", stylesOnly: true }`) holds a\nsingle `tokens.css` and nothing else: design tokens every component of its users adopts. See\n`html-css`.\n\n## Diagnostics\n\n`fudic.json` decides how the project reports each code; `fudic_check` already answers with it\napplied, and a changed severity says so: «(warning by default; error in this project)».\n\n```jsonc\n\"diagnostics\": { \"FUD1380\": \"off\", \"FUD1022\": \"error\", \"warnings\": \"error\" }\n```\n\n- A code's level is `off`, `hint`, `info`, `warning` or `error`. A code beats `warnings`.\n- An error is never lowered nor silenced: that is `FUD1521`, and the error stays.\n- To silence one place, write a comment with its code AND its reason, in the comment the language\n  already has: `@* fud-disable-next-line FUD1380: why *@` in markup, `/* … */` in a `<style>`,\n  `// …` in `@code`, `# …` in a `.fudapi` or a `.fudspec`. `fud-disable FUDnnnn: why` is the whole\n  file. No code or no reason is `FUD1522`; a comment that silences nothing is `FUD1523`: remove it.\n- Silence only what you checked is right, and say why. Fix the code first.\n\n## Baseline\n\nfudic warns (`FUD1524`) when the HTML, CSS or TS of the project uses something of the browser newer\nthan its Baseline: `\"widely\"` when `fudic.json` says nothing.\n\n```jsonc\n\"baseline\": \"widely\"                                // or \"newly\", or a year: 2024\n\"baseline\": { \"target\": \"widely\", \"allow\": [\"popover\"] }\n```\n\nWhat to do with a `FUD1524`, in this order:\n\n1. CSS: put it under `@supports` in a rule of its own, after a fallback that works without it:\n   `textarea { resize: none; } @supports (field-sizing: content) { textarea { field-sizing: content; } }`.\n   A selector: `@supports selector(:state(open)) { … }`.\n2. TS: test it before using it: `if ('showPopover' in el) el.showPopover();`, `el.showPopover?.()`,\n   `typeof URLPattern === 'function'`.\n3. When the project uses it knowingly, add its web-features id (the one in the message's\n   webstatus.dev link) to `allow`. Never lower the target to quiet it.\n\nWhat fudic itself emits never warns. `FUD1525` says the level is older than fudic needs: raise it.\n`FUD1526` is a library using features the app does not accept; `FUD1527` an id of `allow` that is\nnot a feature or moved; `FUD1528` an id nothing uses.\n\n## The guide topics\n\nCall `fudic_guide { topic }` before writing a kind of file for the first time.\n\n| Topic | Read it before |\n|---|---|\n| `overview` | anything: this page |\n| `workflow` | starting any piece: the phases, who approves what, the check and fix loop |\n| `components` | writing a component `.fud`: its shape, props, slots, events, forms |\n| `pages` | writing a route, a page or a layout: params, `load`, layouts, sections, sessions |\n| `view` | writing any `@` expression, condition or loop: what the view may write |\n| `fudapi` | writing a `.fudapi` or its handlers |\n| `fudspec` | writing criteria and fixtures |\n| `testing` | writing a `.test.ts` |\n| `html-css` | writing markup or styles: the HTML subset, scoping, tokens |\n| `config` | changing `fudic.json`, `sw.json` or the `.headers` of an app |\n| `FUD0540` (any code) | fixing that diagnostic: what is wrong and how to fix it |\n",
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_guide` 

```json
{
 "topic": "workflow"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "workflow",
 "related": [
  "view",
  "fudapi",
  "testing",
  "html-css"
 ],
 "body": "# workflow\n\nHow to work on a fudic project: the phases every piece goes through, who approves what, and the\nwrite, check and fix loop.\n\n## One step at a time\n\n- **The first call of any fudic task is `fudic_status`.** It reads the files, the history of each\n  piece and the project's diagnostics, and its `next` says one thing to do. Do that, then call\n  `fudic_status` again.\n- **No project yet** (`phase: \"none\"`): ask the user only what is missing for `fudic_new` (what\n  the app or library is for, its pages or components, its name and tag prefix), then call\n  `fudic_new`.\n- **A workspace whose apps share their error page**: create it in the library, with\n  `fudic_generate { kind: \"error-page\", project: \"<library>\" }`, before the second app. Every app\n  created after it depends on that library and paints its errors with it (topic pages).\n- **Never move on with errors.** While the project has an error, the next step is to fix it.\n- **Before writing a kind of file for the first time**, call `fudic_guide` for its topic. `next`\n  reminds you when you have not read it in this session.\n\n## The phases of a piece\n\nA piece is a component or a route. Each one goes through these phases, in order. A phase is done\nwhen its condition holds; `fudic_status` reports the phase of every piece in `units`.\n\n| # | Phase | Done when | Who |\n|---|---|---|---|\n| 1 | `criteria` | The `.fudspec` and its fixture exist, and the user's approval is recorded and still valid | The user approves props and criteria together |\n| 2 | `api` | Only with a server: the `.fudapi` exists and the `.fud` links it with `<link rel=\"server\">` | You |\n| 3 | `red` | Unit tests exist, and the last run of the tests and of the criteria is red **for the right reason** | You |\n| 4 | `view` | Tests and criteria pass, on the current files | You |\n| 5 | `connect` | Only with a server: every function of the `.fudapi` has a handler | You |\n| 6 | `document` | JSDoc on the component and on each prop | You |\n| 7 | `showcase` | Only in a library with a showcase: its page is up to date | You |\n| 8 | `look` | Only in a component: the user approved how each case of its fixture looks, over the files as they are now | The user, after seeing `fudic_look` |\n| — | `done` | `fudic_record { event: \"done\" }` wrote it in the history | You, when `next` says so |\n\nA library has no `api` and no `connect` phase. A run whose files changed since is `stale` and\ncounts as not run.\n\n### 1. Criteria: ask, propose, wait\n\n1. Create the piece: `fudic_generate { kind: \"component\", name: \"button\", purpose: \"<what the\n   user asked for, in one sentence>\" }`. `purpose` is required for a component and a page.\n2. **Ask, do not build.** Ask the user for the props (name, type, default, meaning) and the\n   behaviour. Propose them yourself when the user is vague, as a short list.\n3. Write the proposal into the `.fudspec` (one criterion per sentence the user would say) and\n   its fixture (one named set of props per case). Show it to the user.\n4. **Wait for the user's approval in the conversation.** Only then call\n   `fudic_record { piece: \"src/components/app-button/app-button.fud\", event: \"approved\" }`.\n\n**Never approve on the user's behalf.** No approval because the criteria look obvious, because\nthe user is in a hurry, or because they asked for many components at once. A user who asks for\n\"a Button, a Card and an Input\" gets questions about the Button first.\n\nThe approval holds the hash of the `.fudspec` and its fixture. Change either one and it\n**expires**: `next` asks you to show the user what changed since the approval and ask again.\n\nWhat goes in the `.fudspec` and what goes in the unit tests:\n\n| `.fudspec` (browser, approved by the user) | Unit tests (written by you, no approval) |\n|---|---|\n| What a person would check by looking and touching | What the user would not see or approve |\n| One sentence of the user is one criterion | Each prop variant; edge values: empty, long, 0 |\n| Keyboard, focus, accessibility, visibility, layout | The `detail` of each event |\n| | Server functions and their failures; each rule of a form |\n\nWhat is already a criterion is not repeated as a unit test.\n\n### 2. The server contract\n\nOnly for a piece with a server. `fudic_generate { kind: \"api\", name: \"src/components/app-cart\" }`\nwrites the `.fudapi` beside the `.fud`, its handler in `src/server` and the\n`<link rel=\"server\">`. A component starts with a `hello` function, a route with its `load`.\nWrite the real contract next. Read `fudapi` first.\n\n### 3. Red for the right reason\n\nWrite the unit tests (read `testing` first), then run `fudic_test` and `fudic_spec_run`. Both\nmust fail, and each failure must be a `fail`: the assertion ran and the component did not do\nit yet. A `broken` result (the test cannot run: a type error, a missing file, a page that does\nnot load) is not red, it is a bug in what you wrote. Fix it until every result is `fail`.\n\n### 4. The view, until green\n\nWrite the `.fud` until `fudic_test` and `fudic_spec_run` pass. **Do not change the tests or the\ncriteria** in this phase: they are the judge. `fudic_test` takes milliseconds, use it as the\nshort loop; `fudic_spec_run` takes seconds, run it to confirm. `failing: true` repeats only\nwhat was red.\n\nIf a test turns out to be wrong, say so to the user instead of editing it. A criterion that has\nto change is a new approval.\n\n### 5. Connect each function\n\nOnly with a server. `fudic_contract { id }` lists every declaration of the `.fudapi` that needs a\nhandler, with its TypeScript signature, its file in `src/server` and a skeleton that compiles.\n`fudic_symbols { kind: \"functions\" }` marks each one `connected` or `missing`. A handler\ntranslates to the backend; it holds no business logic.\n\n### 6. Document\n\nJSDoc is the documentation, and it is what `fudic_describe` serves to whoever uses the piece:\n\n- the first `/** … */` of the `@code` documents the component: what it is for, and when to use\n  another one instead;\n- a `/** … */` above each prop of `props<…>()` documents that prop.\n\n```fud path=src/components/app-badge/app-badge.fud\n@code {\n  /**\n   * A short label beside a title: a state, a count, a category. Its text is the default slot.\n   * For an action, use a button instead.\n   */\n  type Tone = 'neutral' | 'success' | 'warning';\n\n  const { tone = 'neutral' } = props<{\n    /** What the badge says about its subject. `neutral` unless it marks a success or a risk. */\n    tone?: Tone;\n  }>();\n}\n\n<head>\n  <style>\n    :host { display: inline-block; }\n    .badge {\n      font-size: 0.75rem;\n      padding: 0.15rem 0.5rem;\n      border: 1px solid #ccc;\n      border-radius: 999px;\n      background: #f3f3f3;\n      color: #444;\n    }\n    .badge.success { background: #e6f4ea; border-color: #34a853; color: #1e7e34; }\n    .badge.warning { background: #fef7e0; border-color: #f9ab00; color: #b06000; }\n  </style>\n</head>\n\n<app-badge>\n  <template shadowrootmode=\"open\">\n    <span\n      class=\"badge\"\n      class:success=@(tone === 'success')\n      class:warning=@(tone === 'warning')>\n      <slot></slot>\n    </span>\n  </template>\n</app-badge>\n```\n\n### 7. Showcase\n\nOnly in a library that has a showcase: `fudic_generate { kind: \"showcase\", name: \"ui\" }` writes a\npage per component that has a fixture, with a block per case. Run it again after changing a\nfixture; the phase is done when running it would change nothing.\n\n### 8. Look\n\nOnly in a component. `fudic_look { piece }` paints every case of its fixture in a browser and\nanswers each one beside the shot of the look the user last approved: `new`, `same`, `changed` or\n`gone`. Show the user the before and after and ask whether they approve how it looks. Only if they\nsay so, `fudic_record { piece, event: \"look\" }`; without a `fudic_look` over the files as they are\nnow it answers `FUD1427` and writes nothing.\n\n**Seeing is not approving.** `fudic_render`, `fudic_preview` and `fudic_look` show; only\n`fudic_record` writes. The look holds the hash of the files that can change how the component is\ndrawn — its view, what it links and imports, the global sheets — not its tests or its criteria. Change\nany of them and the look **expires**: a piece that was `done` opens again, and `next` takes you through\nits tests, its criteria and `fudic_look` once more. Approved again, it is complete; its `done` stays.\n\n### Done\n\nWhen `next` says so, `fudic_record { piece, event: \"done\" }`. If a phase is still missing it\nanswers `FUD1407` and says which one.\n\nOther events of `fudic_record`, each only when the user says so in the conversation:\n\n| `event` | When |\n|---|---|\n| `accepted` | The user says the client accepted the piece; `text` is what they said |\n| `reopened` | The user asks to change the contract of a piece that is `done`; `text` says why |\n| `look` | The user approved how the component looks, after `fudic_look` showed it to them |\n\n## Write, check, fix\n\nEvery write is followed by a check, and nothing moves on until there are zero diagnostics:\n\n1. **Write.** Through `fudic_write` in a chat, or your own editor tools. `fudic_write` already\n   returns the diagnostics of what it touched.\n2. **`fudic_check`.** What the build would say, over the whole project: one change in a\n   component can break whoever uses it. `paths` only narrows the list.\n3. **`fudic_fix`.** Applies every repair that has exactly one option, checks again and repeats.\n   What has several options comes back in `remaining` with their titles: pick one.\n4. **By hand.** For each diagnostic left, `codes` in the answer carries the why and the fix of\n   each code; `fudic_guide { topic: \"FUD0540\" }` explains any code on its own. Fix it, then\n   check again.\n\n`fudic_format` formats `.fud` and `.fudspec` files. A `TS2322` or any other `TS` code is\nTypeScript's own message, at its position in the `.fud`.\n\n## Rules\n\n- **Create files with `fudic_generate`, never from scratch.** It writes exactly what the CLI\n  writes: the folder, the tag from the prefix, the test, the `.fudspec`, the fixture, the links.\n  Then edit what it created.\n- **Before using a component, call `fudic_describe` with its tag. Never open its file.** The\n  answer has its link, props with types and defaults, slots, events with their `detail`, CSS\n  parts, the tokens it reads, and an example of use. `fudic_symbols { kind: \"components\" }`\n  lists what exists.\n- **Before writing styles, call `fudic_symbols { kind: \"tokens\" }`** and use only those names.\n  See `html-css`.\n- **Before calling a server function or a route, describe it**: `fudic_describe` takes a route\n  (`/blog/:slug`), a type, a function or a token as well as a tag.\n- **Agree the design tokens with the user before the first component**: every component reads\n  them.\n- **Never write a `.fudlog` by hand.** The tools write it: `fudic_record` the decisions,\n  `fudic_test` and `fudic_spec_run` their runs.\n",
 "diagnostics": [],
 "next": null
}
```

*(ToolSearch)*

**Llamada:** `fudic_symbols` 

```json
{
 "kind": "tokens"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "symbols": [
  {
   "kind": "tokens",
   "name": "--tienda-ink",
   "from": null,
   "value": "light-dark(#1c1d21, #ececf1)",
   "at": "src/guide/tokens.css:22:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-muted",
   "from": null,
   "value": "light-dark(#5b606b, #a4a9b4)",
   "at": "src/guide/tokens.css:23:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-surface",
   "from": null,
   "value": "light-dark(#ffffff, #16171b)",
   "at": "src/guide/tokens.css:24:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-raised",
   "from": null,
   "value": "light-dark(#f6f7f9, #202228)",
   "at": "src/guide/tokens.css:25:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-line",
   "from": null,
   "value": "light-dark(#858a94, #6b707c)",
   "at": "src/guide/tokens.css:26:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-accent",
   "from": null,
   "value": "light-dark(#2457d6, #7aa2ff)",
   "at": "src/guide/tokens.css:27:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-on-accent",
   "from": null,
   "value": "light-dark(#ffffff, #0b1020)",
   "group": "on",
   "at": "src/guide/tokens.css:28:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-danger",
   "from": null,
   "value": "light-dark(#c0262d, #ff7b7b)",
   "at": "src/guide/tokens.css:29:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-on-danger",
   "from": null,
   "value": "light-dark(#ffffff, #1a0505)",
   "group": "on",
   "at": "src/guide/tokens.css:30:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-success",
   "from": null,
   "value": "light-dark(#1f7a3d, #5fd38a)",
   "at": "src/guide/tokens.css:31:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-warning",
   "from": null,
   "value": "light-dark(#8a5a00, #f0b44c)",
   "at": "src/guide/tokens.css:32:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-focus",
   "from": null,
   "value": "light-dark(#2457d6, #7aa2ff)",
   "at": "src/guide/tokens.css:33:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-1",
   "from": null,
   "value": "0.25rem",
   "group": "space",
   "at": "src/guide/tokens.css:36:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-2",
   "from": null,
   "value": "0.5rem",
   "group": "space",
   "at": "src/guide/tokens.css:37:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-3",
   "from": null,
   "value": "0.75rem",
   "group": "space",
   "at": "src/guide/tokens.css:38:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-4",
   "from": null,
   "value": "1rem",
   "group": "space",
   "at": "src/guide/tokens.css:39:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-5",
   "from": null,
   "value": "1.5rem",
   "group": "space",
   "at": "src/guide/tokens.css:40:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-6",
   "from": null,
   "value": "2rem",
   "group": "space",
   "at": "src/guide/tokens.css:41:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-7",
   "from": null,
   "value": "3rem",
   "group": "space",
   "at": "src/guide/tokens.css:42:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-space-8",
   "from": null,
   "value": "4rem",
   "group": "space",
   "at": "src/guide/tokens.css:43:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-font-sans",
   "from": null,
   "value": "\"Inter\", system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif",
   "group": "font",
   "at": "src/guide/tokens.css:46:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-font-mono",
   "from": null,
   "value": "ui-monospace, \"SF Mono\", \"Cascadia Code\", Consolas, \"Liberation Mono\", monospace",
   "group": "font",
   "at": "src/guide/tokens.css:47:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-text-xs",
   "from": null,
   "value": "0.75rem",
   "group": "text",
   "at": "src/guide/tokens.css:48:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-text-sm",
   "from": null,
   "value": "0.875rem",
   "group": "text",
   "at": "src/guide/tokens.css:49:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-text-base",
   "from": null,
   "value": "1rem",
   "group": "text",
   "at": "src/guide/tokens.css:50:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-text-lg",
   "from": null,
   "value": "1.125rem",
   "group": "text",
   "at": "src/guide/tokens.css:51:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-text-xl",
   "from": null,
   "value": "1.25rem",
   "group": "text",
   "at": "src/guide/tokens.css:52:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-text-2xl",
   "from": null,
   "value": "1.5rem",
   "group": "text",
   "at": "src/guide/tokens.css:53:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-text-3xl",
   "from": null,
   "value": "2rem",
   "group": "text",
   "at": "src/guide/tokens.css:54:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-leading-tight",
   "from": null,
   "value": "1.25",
   "group": "leading",
   "at": "src/guide/tokens.css:55:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-leading-normal",
   "from": null,
   "value": "1.6",
   "group": "leading",
   "at": "src/guide/tokens.css:56:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-weight-normal",
   "from": null,
   "value": "400",
   "group": "weight",
   "at": "src/guide/tokens.css:57:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-weight-medium",
   "from": null,
   "value": "500",
   "group": "weight",
   "at": "src/guide/tokens.css:58:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-weight-bold",
   "from": null,
   "value": "700",
   "group": "weight",
   "at": "src/guide/tokens.css:59:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-radius-sm",
   "from": null,
   "value": "0.25rem",
   "group": "radius",
   "at": "src/guide/tokens.css:62:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-radius-md",
   "from": null,
   "value": "0.5rem",
   "group": "radius",
   "at": "src/guide/tokens.css:63:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-radius-lg",
   "from": null,
   "value": "0.75rem",
   "group": "radius",
   "at": "src/guide/tokens.css:64:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-radius-full",
   "from": null,
   "value": "9999px",
   "group": "radius",
   "at": "src/guide/tokens.css:65:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-shadow-sm",
   "from": null,
   "value": "0 1px 2px rgb(0 0 0 / 0.08)",
   "group": "shadow",
   "at": "src/guide/tokens.css:66:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-shadow-md",
   "from": null,
   "value": "0 4px 12px rgb(0 0 0 / 0.12)",
   "group": "shadow",
   "at": "src/guide/tokens.css:67:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-focus-width",
   "from": null,
   "value": "2px",
   "group": "focus",
   "at": "src/guide/tokens.css:68:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-duration-fast",
   "from": null,
   "value": "120ms",
   "group": "duration",
   "at": "src/guide/tokens.css:71:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-duration",
   "from": null,
   "value": "200ms",
   "at": "src/guide/tokens.css:72:3"
  },
  {
   "kind": "tokens",
   "name": "--tienda-easing",
   "from": null,
   "value": "cubic-bezier(0.2, 0, 0, 1)",
   "at": "src/guide/tokens.css:73:3"
  }
 ],
 "diagnostics": [],
 "next": null
}
```

**Modelo:** Los tokens de diseño ya existen (`src/guide/tokens.css`: color, espaciado, tipografía, radios, sombras, foco), así que podemos ir directamente al primer componente. fudic pide empezar de uno en uno, y acordar props y criterios contigo **antes** de escribir la vista — así que empezamos por el botón.

**Llamada:** `fudic_generate` 

```json
{
 "kind": "component",
 "name": "button",
 "purpose": "Un botón para la tienda: la acción principal de cada pantalla (añadir al carrito, comprar) y también acciones secundarias."
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "command": "fudic g component button",
 "changes": [
  {
   "create": "src/components/tienda-button/tienda-button.fud"
  },
  {
   "create": "src/components/tienda-button/tienda-button.test.ts"
  },
  {
   "create": "src/components/tienda-button/tienda-button.fudspec"
  },
  {
   "create": "src/components/tienda-button/tienda-button.fixture.ts"
  }
 ],
 "commands": [],
 "written": true,
 "ran": [],
 "report": [
  "",
  "Created <tienda-button> in src/components/tienda-button/",
  "",
  "  tienda-button.fud         the component",
  "  tienda-button.test.ts     unit test               pnpm --filter tienda test",
  "  tienda-button.fudspec     acceptance criteria     pnpm --filter tienda spec",
  "  tienda-button.fixture.ts  the props the criteria mount it with"
 ],
 "diagnostics": [],
 "next": "Call fudic_status."
}
```

**Modelo:** Ya está el esqueleto de `<tienda-button>`. Antes de escribir los criterios necesito la guía de `.fudspec`.

**Llamada:** `fudic_guide` 

```json
{
 "topic": "fudspec"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "fudspec",
 "related": [
  "testing"
 ],
 "body": "# fudspec\n\nThe `.fudspec` language: the acceptance criteria of a component, a page or a flow between pages, written in the user's words, run in a real browser, approved by the user together with the props.\n\n## What it is for\n\nA `.fudspec` holds what a person would check by looking at the component and touching it: what is visible, what it says, what a click or a key does, where the focus goes, what a screen reader is told, how big it is. **One sentence of the user is one criterion** (\"a disabled button does nothing\", \"the second tab shows its panel\").\n\nThe props (in the `.fud`) and the criteria (in the `.fudspec`, with its fixture) are what the user approves. Propose them in the conversation in plain language, wait for the user's yes, then call `fudic_record { piece: \"src/components/app-post/app-post.fud\", event: \"approved\" }`. Never approve on the user's behalf. Changing the `.fudspec` or its fixture afterwards makes the approval expire, and `fudic_status` asks for it again.\n\nWhat the user does not see (each prop variant, edge values, an event's `detail`, server functions, form rules) goes in unit tests: topic `testing`.\n\n## Create it\n\n`fudic_generate { kind: \"component\", name: \"post\" }` already writes `app-post.fudspec` and `app-post.fixture.ts` with one passing criterion. For a component that has none: `fudic_generate { kind: \"spec\", name: \"app-post\" }`. Never write the files from scratch.\n\n```\nsrc/components/app-post/app-post.fud\nsrc/components/app-post/app-post.fudspec      the criteria\nsrc/components/app-post/app-post.fixture.ts   the props each criterion mounts it with\nfudic/terms/<block>/<name>.js                 terms of your own, at the project root\n```\n\n## The shape of a file\n\n```\ncomponent <tag>\n\n# A comment explains why the criterion exists.\ncriterion <slug>\n  given\n    props <fixture>\n  when\n    <term> <args>\n  then\n    <term> <args>\n```\n\n- Indentation is structure: 0 spaces for `component` and `criterion`, 2 for `given`/`when`/`then`, 4 for a term. Tabs or other widths are `FUD0921`.\n- The first line says what the file is about (`FUD0922` missing, `FUD0923` twice): `component <tag>` (a component of the project, `FUD0949`), `page <route>` (a route, written as on disk: `page /products`, `page /blog/[slug]`, `page /`; `FUD1500` if it does not exist) or `flow <name>` (a path between pages, in `src/flows/<name>.fudspec`). Pages and flows have sections of their own below.\n- `criterion <slug>`: a kebab-case name, unique in the file (`FUD0927`). It names the criterion in every report.\n- `given` comes first and at most once; then `when` and `then` alternate as many times as the story needs, and the criterion ends in a `then` (`FUD0930` for `given` after another block or two equal blocks in a row, `FUD0933` for an ending that is not a `then`). `given` and `when` are optional. An empty block is `FUD0934`.\n- Before every `then` the page is quiet: no request on its way, no `setTimeout` due within a second, no animation frame pending (a `setInterval` does not count). A page that never settles is `FUD1508`, with what was still pending. A positive `then` is tried again until it holds or the time is up (5 s); a negative one (`count … 0`, `hidden`, `unchecked`, `called … 0`, `not-reloaded`) is read once, on the quiet page.\n- `#` starts a comment to the end of the line.\n- Arguments: a bare token (`app-post`, `16`, `href`), a string in double quotes on one line (`\"Tab B\"`, `FUD0920` unclosed), or a role reference.\n- Several `then` lines are all checked; a red one does not stop the others.\n\n## Targets: tag or role with its name\n\nA term that takes an element accepts:\n\n- a tag: `app-post`, `article`, `time`;\n- `role:<role>/\"<name>\"`: the element with that ARIA role and exactly that accessible name: `role:tab/\"Tab B\"`, `role:link/\"Featured\"`, `role:button/\"Save\"`;\n- `role:<role>` alone, when there is only one: `role:tabpanel`;\n- `role:<role>/~\"<text>\"`: the accessible name contains the text: `role:row/~\"Ana\"`;\n- steps joined by `>`, each looked for inside the one before: `role:row/~\"Luis\">role:button/\"Delete\"` is the «Delete» of Luis's row, where every row has one. A `>` with no step or a `~` with no text is `FUD1509`.\n\nReferences go through shadow roots. A reference must match **exactly one** element; more is an error that says how many (`FUD1203`). Prefer roles and names: they are what a person and a screen reader perceive, and a criterion written with them also checks the accessibility. If no role with a name finds the element, the component is probably missing a label: fix the component, not the criterion.\n\n## The fixture: the cases\n\nEach key of the fixture's `export default` is one case: a set of props the component is mounted with. `props <key>` in `given` picks it.\n\n- A component with required props needs `props <key>` in every criterion (`FUD0951`); there is no default case.\n- `props` goes in `given`, once (`FUD0952`), and names an existing key (`FUD0950`). The file is `<tag>.fixture.ts` beside the `.fud` (`FUD0953`).\n- Type it with `satisfies Fixtures<$Props>`: a missing required prop is a type error.\n- `$content` is HTML placed inside the host as its children: how a slot gets filled.\n- A `Signal` prop takes its initial value, which must be plain JSON (`FUD0974`).\n\n```fud path=src/components/app-post/app-post.fud\n@code {\n  /** A post in a list: its title links to it; what is written inside is the summary. */\n  const { title, href, variant = \"default\" } = props<{\n    /** The title, one line or two. */\n    title: string;\n    /** Where the title links to. */\n    href: string;\n    /** \"highlight\" draws the card with the brand border. */\n    variant?: \"default\" | \"highlight\";\n  }>();\n}\n\n<head>\n  <style>\n    .card {\n      border: 1px solid #dcdcdc;\n      border-radius: 10px;\n      padding: 1rem 1.15rem;\n      background: white;\n      h2 {\n        margin: 0 0 0.35rem;\n        font-size: 1.05rem;\n      }\n      a {\n        color: inherit;\n      }\n    }\n    .card.highlight {\n      border-color: #1a73e8;\n    }\n  </style>\n</head>\n\n<app-post>\n  <template shadowrootmode=\"open\">\n    <article class=\"card\" class:highlight=@(variant === \"highlight\")>\n      <header>\n        <h2><a href=@href>@title</a></h2>\n        <slot name=\"meta\"></slot>\n      </header>\n      <div class=\"body\">\n        <slot></slot>\n      </div>\n    </article>\n  </template>\n</app-post>\n```\n\n```ts path=src/components/app-post/app-post.fixture.ts\nimport type { Fixtures } from '@fudic/terms';\nimport type { $Props } from './app-post.fud';\n\n// The props each criterion of app-post.fudspec mounts the card with (`props <name>`).\nexport default {\n  base: { title: 'A', href: '/' },\n  'long-title': {\n    title: 'A title long enough that it has to wrap onto a second line inside the card',\n    href: '/blog/long',\n  },\n  featured: { title: 'Featured', href: '/blog/featured', variant: 'highlight' },\n  dated: { title: 'Dated', href: '/blog/dated', $content: '<time slot=\"meta\">May 2026</time>' },\n} satisfies Fixtures<$Props>;\n```\n\n```fudspec path=src/components/app-post/app-post.fudspec\ncomponent app-post\n\n# A card never collapses, whatever its title. It is mounted without the app's layout,\n# so 16px is one line of title.\ncriterion min-height\n  given\n    props base\n  then\n    min-height app-post 16\n\ncriterion long-title-visible\n  given\n    props long-title\n  then\n    visible app-post\n    text app-post \"A title long enough\"\n\n# The link is not clicked: it would navigate away from the card.\ncriterion title-links-to-post\n  given\n    props featured\n  then\n    visible role:link/\"Featured\"\n    attribute role:link/\"Featured\" href \"/blog/featured\"\n\ncriterion featured-is-highlighted\n  given\n    props featured\n  then\n    has-class article highlight\n\ncriterion date-beside-title\n  given\n    props dated\n  then\n    slotted time meta\n    text app-post \"May 2026\"\n```\n\n## The stock terms\n\nThey come with `@fudic/terms`; no file to write.\n\n| Block | Term | Passes when / does |\n|---|---|---|\n| `given` | `props <fixture>` | mounts with that case |\n| `when` | `click <target>` | clicks it, and waits until the page served the click |\n| `when` | `press <target> \"<key>\"` | focuses it and presses `x`, `Enter`, `Shift+Tab`… |\n| `when` | `type <target> \"<text>\"` | types into it, key by key |\n| `when` | `focus <target>` | focuses it |\n| `when` | `set-attribute <target> <attribute> \"<value>\"` | sets the attribute |\n| `then` | `present <target>` | it is in the page, even empty and taking no room |\n| `then` | `visible <target>` | it is on screen, with a size |\n| `then` | `hidden <target>` | it is not visible |\n| `then` | `text <target> \"<expected>\"` | the text a person sees in it, across shadow roots and slots, contains it |\n| `then` | `attribute <target> <attribute> \"<expected>\"` | the attribute has exactly that value |\n| `then` | `focused <target>` | it has the focus, followed into every shadow root |\n| `then` | `slotted <target> <slot>` | it went to that slot of its host (`default` is the unnamed one) |\n| `then` | `min-height <target> <px>` · `min-width <target> <px>` | it is at least that big |\n| `given` | `cookie <name> \"<value>\"` | the browser has that cookie, for the whole site, before it opens |\n| `given` | `locale <tag>` | the page in that language: `Accept-Language` and `navigator.language` |\n| `given` | `media <feature> <value>` | `prefers-color-scheme dark`, `prefers-reduced-motion reduce`, `forced-colors active`… |\n| `given` | `viewport <width> <height>` | the size of the window |\n| `given` | `clock <instant>` | the time, ISO 8601, in the browser and in the criterion's server, standing still until a `wait` |\n| `given` · `when` | `offline` · `online` | without network (a page visited before still opens from the Service Worker) |\n| `when` | `go <url>` · `back` · `forward` · `reload` | the address bar and the history |\n| `when` | `check <target>` · `uncheck <target>` | clicks a checkbox, as a person would |\n| `when` | `select <target> \"<option>\"` · `hover <target>` | picks an option by its text · moves the mouse over it |\n| `when` | `upload <target> \"<file>\"` | chooses that file (relative to the `.fudspec`, `FUD1511` if missing) |\n| `when` | `wait <ms>` | moves the clock that long (both clocks with `clock`; real time without) |\n| any | `as <who>` | what follows is done by another person: a browser of their own, with their own cookies; `as main` comes back |\n| `then` | `title \"<expected>\"` · `url <path>` | the `<title>` · where the page is, path and query |\n| `then` | `status <code>` · `header <name> \"<expected>\"` | of the last document response (an `_error.fud` answers its code) |\n| `then` | `count <target> <n>` | how many elements the reference gives (here more than one is fine) |\n| `then` | `value <target> \"<expected>\"` · `checked` · `unchecked` · `enabled` · `disabled` | the state of a control |\n| `then` | `called <fn> <times>` · `sent <fn> <field> \"<expected>\"` | what the page asked the server in this criterion: how many times, and a field of the last call (`user`, `docs.0`; a file is its name) |\n| `then` | `lists \"<value>\"` | the real `paths()` of the route includes it |\n| `then` | `not-reloaded` · `requests <n>` · `downloaded \"<name>\"` | over the last `when` block: the same document, how many requests went out, a file it downloaded |\n\nAn unknown term is `FUD0940` (the message lists the ones the block has); the wrong number of arguments `FUD0947`; an argument of the wrong form `FUD0948`.\n\n```fud path=src/components/app-tabs/app-tabs.fud\n@code {\n  /** Two tabs; the first is open when the page loads. */\n  import { signal } from \"@fudic/core\";\n\n  const active = signal(0);\n\n  function pickA() {\n    active.set(0);\n  }\n\n  function pickB() {\n    active.set(1);\n  }\n}\n\n<app-tabs>\n  <template shadowrootmode=\"open\">\n    <div role=\"tablist\">\n      <button role=\"tab\" @click=@pickA>Tab A</button>\n      <button role=\"tab\" @click=@pickB>Tab B</button>\n    </div>\n    <p role=\"tabpanel\">@(active() === 0 ? \"panel A\" : \"panel B\")</p>\n  </template>\n</app-tabs>\n```\n\n```fudspec path=src/components/app-tabs/app-tabs.fudspec\ncomponent app-tabs\n\n# The first tab is the one open when the page loads.\ncriterion starts-on-a\n  then\n    text role:tabpanel \"panel A\"\n\n# One click on the second tab shows its panel, even on a component not yet hydrated.\ncriterion switches-tab\n  when\n    click role:tab/\"Tab B\"\n  then\n    text role:tabpanel \"panel B\"\n```\n\n`app-tabs` has no required props, so its criteria need no `given`.\n\n## Where it runs\n\n- Each criterion of a component gets its own page that mounts the component **alone**: no layout, no stylesheet the layout links, no navigation. Do not click a link that leaves the page; do not depend on a token the layout defines. A page or a flow is the app itself (below).\n- A component not hydrated yet takes its first gesture anyway: a `when` waits until the page has served it, hydration included, so the `then` after it reads the new state.\n- Criteria run in parallel, each with 30 s to load.\n\n## Pages\n\n`page <route>` checks a route with its real layout, opened by its URL in the app with the user's own `vite.config`. **What the fixture names is fake, and everything else is real**: the `layout` always runs; `load` runs unless the criterion says `data`; a function runs unless an `answers` group answers it; `paths()` runs unless the fixture lists `paths`. `fudic_generate { kind: \"spec\", name: \"/shop\" }` writes `shop.fudspec` and `shop.fixture.ts` next to the route, the fixture typed with the `Fixtures` its `.fudapi` gives.\n\n```ts path=src/services/items.ts\nimport { Service } from '@fudic/di';\n\n/** Where the shop keeps its items: a flow puts one of its own in its place. */\nexport class Items {\n  readonly #list: string[];\n\n  constructor(list: readonly string[] = ['Coffee', 'Tea']) {\n    this.#list = [...list];\n  }\n\n  all(): readonly string[] {\n    return this.#list;\n  }\n\n  add(name: string): void {\n    this.#list.push(name);\n  }\n}\nService(Items);\n```\n\n```fudapi path=src/routes/shop.fudapi\nload ssr\n  items    str[]\n  session  str?\n\npost login\n  invalidates /shop\n  user  str\n\npost add\n  invalidates /shop\n  name  str\n```\n\n```ts path=src/server/routes/shop.ts\nimport { inject } from '@fudic/di';\nimport { setCookie } from '@fudic/http';\nimport { add, load, login } from 'fudic:routes/shop';\nimport { Items } from '../../services/items';\n\nload.handle((ctx) => {\n  const session = ctx.cookies.get('sid');\n  return { items: [...inject(Items).all()], ...(session !== undefined ? { session } : {}) };\n});\n\nlogin.handle((ctx) => setCookie(ctx, 'sid', ctx.args.user));\n\nadd.handle((ctx) => inject(Items).add(ctx.args.name));\n```\n\n```fud path=src/routes/shop.fud\n<link rel=\"layout\" href=\"../layouts/_layout.fud\">\n<link rel=\"server\" href=\"./shop.fudapi\">\n\n@code {\n  async function signIn() {\n    await login({ user: \"ana\" });\n  }\n\n  async function addMilk() {\n    await add({ name: \"Milk\" });\n  }\n}\n\n<head>\n  <title>Shop</title>\n</head>\n\n<h1>Shop</h1>\n<p>Signed in: @(data.session === undefined ? \"nobody\" : data.session)</p>\n<button @click=@signIn>Sign in as Ana</button>\n<button @click=@addMilk>Add milk</button>\n<ul>\n  @foreach (const item of data.items) key (item) {\n    <li>@item</li>\n  }\n</ul>\n```\n\n```ts path=src/routes/shop.fixture.ts\nimport type { Fixtures } from 'fudic:routes/shop';\nimport { fails } from '@fudic/spec';\n\nexport default {\n  data: {\n    two: { items: ['Coffee', 'Tea'] },\n    'two-signed-in': { items: ['Coffee', 'Tea'], session: 'ana' },\n    none: { items: [] },\n    down: fails(503, 'the database does not answer'),\n  },\n  calls: {\n    'ana-in': { login: undefined },\n  },\n} satisfies Fixtures;\n```\n\n```fudspec path=src/routes/shop.fudspec\npage /shop\n\n# The list comes from the fixture: load does not run.\ncriterion lists-the-items\n  given\n    data two\n  then\n    title \"Shop\"\n    count role:listitem 2\n\n# login answers from the fixture, and names the page in `invalidates`: the page asks for its\n# data again, and gets the next name of `data`.\ncriterion signing-in-says-who\n  given\n    data two two-signed-in\n    answers ana-in\n  when\n    click role:button/\"Sign in as Ana\"\n  then\n    sent login user \"ana\"\n    text main \"Signed in: ana\"\n\ncriterion a-failing-load-is-the-error-page\n  given\n    data down\n  then\n    status 503\n```\n\nThe lines of a page's `given` (they are read against the fixture, not terms):\n\n| Line | Does |\n|---|---|\n| `data <name>+` | what `load` returns: the first name, then the next each time the page asks for its data again (an `invalidates`); the last repeats |\n| `answers <name>+` | those groups of `calls` together; the last wins when two answer the same function |\n| `services <name>` | the services of that group, put in place of the real ones |\n| `path <value>` | opens the route with that value of the fixture's `paths` (`FUD1502` if it is not there) |\n| `url <url>` | opens that URL, which has to match the route (`FUD1503`) |\n\nA route with params needs `path` or `url` (`FUD1504`). A name the fixture does not have is `FUD0950`; no fixture file, `FUD0953`; a line for another kind of spec (`props` on a page, `data` on a component), `FUD1501`. `called` and `sent` name functions the page can call (`FUD1506`) and their arguments (`FUD1507`).\n\nThe helpers of `@fudic/spec` return data, never promises, so the editor reads the fixture without running it: `fails(status, title)` or `fails('code')` (only the codes the function's `fails` declares), `redirects('/login')`, `later(2000, value)`, `later.never()`, `later.fails(ms, status, title)`, `file('./fixtures/list.csv', { type: 'text/csv' })` for a `-> file` function. A `later` waits on the criterion's clock: with `clock` it arrives at the `wait` that reaches it.\n\n## Flows\n\n`flow <name>` follows a person across pages with **the real server**: login, cookies, redirects and every function run for real. The fixture only says where the data lives (`services`), and each `use` runs once per criterion: what one criterion creates every page of it sees, and no other criterion does, even running at the same time. `fudic_generate { kind: \"flow\", name: \"checkout\" }` writes `src/flows/checkout.fudspec` and its fixture.\n\n```ts path=src/flows/checkout.fixture.ts\nimport type { FlowFixtures } from '@fudic/spec';\nimport { fails } from '@fudic/spec';\nimport { Items } from '../services/items';\n\nexport default {\n  services: {\n    empty: [{ provide: Items, use: () => new Items([]) }],\n  },\n  calls: {\n    'no-network': { add: fails(0, 'network') },\n  },\n} satisfies FlowFixtures;\n```\n\n```fudspec path=src/flows/checkout.fudspec\nflow checkout\n\n# What one criterion adds, its pages see; the next criterion starts empty again.\ncriterion what-is-added-is-in-the-list\n  given\n    services empty\n    url /shop\n  when\n    click role:button/\"Add milk\"\n    go /shop\n  then\n    count role:listitem 1\n    text role:listitem \"Milk\"\n\n# Luis has a browser of his own: Ana's cookie is not his.\ncriterion another-person-is-not-signed-in\n  given\n    services empty\n    url /shop\n  when\n    click role:button/\"Sign in as Ana\"\n    as luis\n    go /shop\n  then\n    text main \"Signed in: nobody\"\n    as main\n    text main \"Signed in: ana\"\n\ncriterion without-network-nothing-is-added\n  given\n    services empty\n    answers no-network\n    url /shop\n  when\n    click role:button/\"Add milk\"\n  then\n    called add 1\n    count role:listitem 0\n```\n\nEach criterion starts at its `url`; `go` goes on from there (`FUD1505`, a warning, for a URL no route answers). `fails(0, …)` is a network failure: the call gets no response at all. A criterion with `offline` runs against the app built and served with `vite preview`, the only place the Service Worker paints a page.\n\nA backend that is not fudic's TypeScript server gets the same cookie, `fudic-bench=<criterion>`, on every request of the criterion, and asks the workbench `GET /__bench/criterion/<id>` for `{ services, answers, clock }` by name, to seed itself.\n\n## Recording a fixture\n\n`fudic_spec_run { spec: \"/shop\", record: true }` runs the criteria of a page or a flow against the real server, with no `data` and no `answers`, and writes what it answered into the fixture under the criterion's name: each `data` the route asked for (`<criterion>`, `<criterion>-2`…), each answer of a function in `calls['<criterion>']`, a received file as `file(…)` with its bytes beside it. The `.fudspec` lines are rewritten to name them, so the criterion runs afterwards with the server stopped. Only a criterion that passes is recorded; a value that cannot be written as a literal is `FUD1515` and left out. Recording again replaces what that name had.\n\n## Terms of your own\n\nWhen no stock term says it, write one: `fudic_generate { kind: \"term\", name: \"has-class\", block: \"then\", params: [\"target:element\", \"name:token\"] }` writes `fudic/terms/then/has-class.js`. Parameter types: `element`, `number`, `string`, `token` (`FUD0962` otherwise). A term of the project replaces a stock term of the same name.\n\n```js path=fudic/terms/then/has-class.js\nexport const meta = {\n  name: 'has-class',\n  block: 'then',\n  params: [\n    { name: 'target', type: 'element' },\n    { name: 'name', type: 'token' },\n  ],\n};\n\n/** @type {import('@fudic/terms').Term['run']} */\nexport async function run(ctx, { target, name }) {\n  const classes = await ctx.locate(String(target)).evaluate((el) => [...el.classList]);\n  return {\n    pass: classes.includes(String(name)),\n    evidence: { expected: `class \"${name}\"`, actual: `classes \"${classes.join(' ')}\"` },\n  };\n}\n\nexport const selfTest = [{ args: { target: 'article', name: 'highlight' }, expect: 'pass' }];\n```\n\n- `meta` is read without running the module: `name`, `block` and `params` are literals (`FUD0941`), `name` is the file name (`FUD0942`) and `block` its folder (`FUD0943`).\n- `run(ctx, args)` gets the arguments by parameter name (a `number` arrives as a number). A `then` returns `{ pass, evidence: { expected, actual } }`, both as text a person reads; that is what a red report shows. A `when` or `given` returns a sentence of what it did.\n- `ctx.page` is the Playwright page; `ctx.locate(ref)` a locator that must match one element; `ctx.act(target, gesture)` runs a gesture and waits until the page served it (every `when` that touches the page goes through it); `ctx.text(target)` the text a person sees.\n- A project term exports `selfTest` (`FUD0946`) and `run` (`FUD0945`).\n\n## Running it\n\n`fudic_spec_run { spec: \"app-post\" }` runs the criteria of one component (a tag or a path), of a page (`/shop`, `/blog/[slug]`) or of a flow (`checkout`); without `spec`, every `.fudspec`. `criteria: [\"min-height\"]` runs some; `failing: true` only those that did not pass last time. A page or a flow also answers `calls`: by criterion, every call it made, with its arguments, whether the fixture answered it (`faked`) and its status.\n\n`fudic_render { route: \"/shop\", fixture: { data: \"none\" } }` and `fudic_preview` with the same `fixture: { data, answers, services }` show a route the way a criterion opens it (`FUD1516` for a name the fixture does not have, `FUD1517` with no fixture).\n\nOnly what did not pass is detailed: the criterion and its place in the `.fudspec`, the red step with what it expected and what it got, the element it located back in the `.fud` (`source`, `quote`), a screenshot under `.fudic/runs/`, and the errors of the page.\n\n- **pass**: every `then` passed.\n- **fail**: a `then` said no. Before the view exists, this is the right red: the criterion runs and finds nothing (`actual: not there`).\n- **error**: the criterion could not reach a verdict: the page did not load (`FUD1200`), an unknown term (`FUD1201`), a step out of time (`FUD1202`), a reference matching several elements (`FUD1203`), a term that threw (`FUD1204`), an error in the page (`FUD1205`), `fudic/bench.js` failed (`FUD1206`), anything else (`FUD1207`). An error is never the right red: fix it before going on.\n\nA `.fudspec` with diagnostics runs nothing; `fudic_check` reports them like any other file. After an edit of the `.fud`, run `fudic_test` first (milliseconds), then `fudic_spec_run` to confirm (seconds).\n",
 "diagnostics": [],
 "next": null
}
```

*(Read src\components\tienda-button\tienda-button.fud)*

*(Read src\components\tienda-button\tienda-button.fudspec)*

*(Read src\components\tienda-button\tienda-button.fixture.ts)*

**Llamada:** `fudic_guide` 

```json
{
 "topic": "components"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "components",
 "related": [
  "pages",
  "view",
  "fudapi",
  "testing",
  "html-css"
 ],
 "body": "# components\n\nHow to write a `.fud` component: the file, its props and state, using other components, events, calling the server, and the React habits that do not apply.\n\n## Create it, never write it from scratch\n\nCall `fudic_generate { kind: \"component\", name: \"card\" }`. The project prefix turns the name into the tag (`app-card`; a name with a hyphen is kept whole) and writes four files in `src/components/app-card/`: `app-card.fud`, `app-card.test.ts`, `app-card.fudspec` and `app-card.fixture.ts`. They pass as generated. The `.fud` starts as an empty `<style>` and the tag around an empty template; you fill it in. When you add a required prop, give it a value in `base` of the `.fixture.ts` (`base: { title: \"Card\" }`), or the fixture stops type-checking.\n\n## The shape of the file, in this order\n\n1. `<link rel=\"component\" href=\"…\">` for each component it uses, and `<link rel=\"server\" href=\"./app-card.fudapi\">` if it calls the server.\n2. One `@code { }` block (a second one is `FUD0154`). TypeScript.\n3. `<head><style>…</style></head>`: one `<style>` (`FUD0159`), scoped to the component. Optional.\n4. The component's own tag wrapping exactly one `<template shadowrootmode=\"open\">` (`FUD0156`, `FUD0157`). Everything it renders goes inside the template.\n5. `@snippet name(args) { … }` declarations, if any: reusable markup of this file, called with `@render name(…)`.\n\nOut of order is `FUD0155`. A component may have no `@code` and no `<head>`.\n\n```fud path=src/components/app-card/app-card.fud\n@code {\n  /**\n   * A card with a heading. What is written between its tags fills the body; an element with\n   * slot=\"meta\" goes beside the heading. The body folds with a button.\n   */\n  const { title, variant = \"default\" } = props<{\n    /** The heading of the card: one short line. */\n    title: string;\n    /** \"highlight\" draws the card with a strong border. */\n    variant?: \"default\" | \"highlight\";\n  }>();\n\n  import { signal } from \"@fudic/core\";\n\n  const open = signal(true);\n\n  function toggle() {\n    open.set(!open());\n  }\n}\n\n<head>\n  <style>\n    :host { display: block; }\n    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }\n    .card.highlight { border-color: #1a73e8; }\n    ::slotted([slot=\"meta\"]) { font-size: 0.8rem; }\n  </style>\n</head>\n\n<app-card>\n  <template shadowrootmode=\"open\">\n    <article class=\"card\" class:highlight=@(variant === \"highlight\")>\n      <header>\n        @render heading(@title)\n        <slot name=\"meta\"></slot>\n      </header>\n      @if (open()) {\n        <div class=\"body\"><slot></slot></div>\n      }\n      <button type=\"button\" @click=@toggle>\n        @if (open()) { Fold } else { Unfold }\n      </button>\n    </article>\n  </template>\n</app-card>\n\n@snippet heading(text: string) {\n  <h2>@text</h2>\n}\n```\n\nStyles: `:host` is the component's own tag, `:host(:empty)` and the like work, `::slotted(sel)` styles what the page put in a slot. A `class:` on the component's own tag is `FUD0720`: put it on an element inside the template. Tokens and the CSS fudic accepts: topic `html-css`. Expressions, `@if`, `@foreach`, `@render`: topic `view`. Tests and criteria: topic `testing`; after every write, `fudic_check`.\n\n## Props\n\n- **One `props<T>()` call**, destructured: `const { title, variant = \"default\" } = props<{ … }>()`. The view reads the destructured names (`@title`), never `props.x`.\n- **Required** = a key without `?`. Not passing it is a TypeScript error on the tag. An unknown prop is `TS2561`.\n- **Optional** = `?`. Its **default** goes in the destructuring, and only optional props take one. A value prop follows the parent: `.count=@n()` with a signal `n` repaints the child when `n` changes.\n- **JSDoc**: the first `/** … */` of the `@code` documents the component; a `/** … */` on each key of `T` documents the prop. `fudic_describe` and the editor show them, and `fudic_status` counts what is documented.\n- **Rest**: `const { label, ...rest } = props<{ label: string; placeholder?: string; required?: boolean }>()` gathers the keys not named; `<input ...rest>` writes them as attributes. `T` must be a literal or a type declared in the same `@code`.\n- **A signal prop**: `value: Signal<number>` (type from `@fudic/core`) receives the parent's signal itself, so the child can read, derive and write it. The parent passes the bare name: `.value=@count` (anything else is `FUD0200`).\n- **A callback prop**: `onPick: (option: string) => void`. The parent passes the bare name of a function of its `@code` (`.onPick=@chosen`, else `FUD0201`), and the child must call it from a handler (`FUD0202` otherwise). This is the way back to one parent.\n\n## State and what `@code` may do\n\n`@code` is browser code. There is no `@server` / `@client` region (`FUD1110`): the server evaluates only what the view reads.\n\n- `signal(v)`: read `n()`, write `n.set(v)`. `computed(() => expr)`: derived and read-only.\n- `effect(fn)` reruns when anything it read changes. `effect(fn, [a, () => user().id])` reruns only when one of those sources changes, and nothing else the body reads counts; `[]` runs once. Pass sources, not values: `[count()]` is a type error. A returned function is the cleanup, run before the next run and on removal.\n- Effects and tasks created while `@code` runs are torn down with the component (the compiler wraps the block in `owned`; never call it yourself). One created inside a handler lives as long as the page.\n- What the view reads must be something the server can evaluate: props, `signal(v)`, `computed(() => e)` whose `e` follows the view rules, a `const` of plain data. Anything else it reads is `FUD1150`. The view calls nothing but reactive reads (`FUD1140`).\n- `now()` only as the whole initializer of a signal: `signal(now())` (`FUD0912`).\n- Handlers and effect bodies are plain TypeScript: DOM APIs, `await`, anything. Names starting with `$` are reserved (`FUD0290`).\n- Code that runs at a moment of the component's life — after it hydrates, each time it enters the page, when it is destroyed — goes in a lifecycle hook: `afterHydrate(fn)`, `onConnect(fn)`… See Lifecycle.\n\n## Using another component\n\nLink it, then write its tag. A tag with no link is `FUD0191`; a link never used is `FUD0721`. Before using one, call `fudic_describe { name: \"app-card\" }` for its props, slots and events instead of opening its file.\n\n```fud path=src/components/app-badge/app-badge.fud\n@code {\n  /** A small rounded label. Its text is what is written between the tags. */\n  const { tone = \"neutral\" } = props<{\n    /** The colour: \"neutral\" grey or \"success\" green. */\n    tone?: \"neutral\" | \"success\";\n  }>();\n}\n\n<head>\n  <style>\n    .badge { padding: 0.15rem 0.5rem; border-radius: 999px; background: #f3f3f3; }\n    .badge.success { background: #e6f4ea; }\n  </style>\n</head>\n\n<app-badge>\n  <template shadowrootmode=\"open\">\n    <span class=\"badge\" class:success=@(tone === \"success\")><slot></slot></span>\n  </template>\n</app-badge>\n```\n\n```fud path=src/components/app-feed/app-feed.fud\n<link rel=\"component\" href=\"../app-card/app-card.fud\">\n<link rel=\"component\" href=\"../app-badge/app-badge.fud\">\n\n@code {\n  /** The list of posts, one card each, the featured ones highlighted. */\n  type Post = { id: string; title: string; tag: string; summary: string; featured: boolean };\n\n  const { posts = [] } = props<{\n    /** The posts to show, in order. */\n    posts?: readonly Post[];\n  }>();\n}\n\n<app-feed>\n  <template shadowrootmode=\"open\">\n    @foreach (const post of posts) key (post.id) {\n      <app-card ...post .variant=@(post.featured ? \"highlight\" : \"default\")>\n        <app-badge slot=\"meta\" .tone=@(post.featured ? \"success\" : \"neutral\")>@post.tag</app-badge>\n        @post.summary\n      </app-card>\n    } @empty {\n      <p>No posts yet.</p>\n    }\n  </template>\n</app-feed>\n```\n\n- **`.prop=` passes a prop**: `.title=\"Hello\"` (a string), `.count=3`, `.open=true`, `.title=@post.title`, `.variant=@(expr)`. It is the only way to pass a prop.\n- **A plain attribute is HTML** on the host: `id`, `class`, `role`, `data-*`, `aria-*`. `tone=\"info\"` on a component is a TypeScript error, not a prop.\n- **`class:name=@cond`** toggles a class of this file's `<style>` on the child's tag or any element.\n- **`@event=@handler`** listens on that element (see Events).\n- **Slots**: the child declares `<slot></slot>` (default) and `<slot name=\"meta\"></slot>`; the parent writes content between the tags, and `slot=\"meta\"` on an element sends it to the named one. A `<slot>` may hold fallback content.\n- **Spread**: `...post` passes one prop per key the child declares, read from `post`; extra keys are ignored, a missing optional key takes its default. A `.prop` on the same tag wins its key. Only a name or a path follows the dots (`FUD0991`); not on the component's own tag or template (`FUD0992`).\n- **`control=@form.field`** on a form-associated component reaches its `ctrl` prop (see Forms).\n\n## Events\n\nA handler, on any element, is a reference (`@click=@save`: `save` gets the DOM event), a call (`@click=@remove(item.id)`, `@keydown=@onKey($event, item.id)`: the arguments you write, `$event` being the event) or a lambda (`@click=@(() => count.set(0))`). Anything else is `FUD0291`; `onclick=\"…\"` is `FUD0909`.\n\n`ref=\"@field\"` assigns the element to a variable you declare, `let field: HTMLInputElement | null = null;`: `null` until rendered and while an `@if` hides it. One identifier (`FUD0094`), never inside a loop (`FUD0192`). Use it from handlers and effects (see `app-search` below).\n\n**`emit(name, detail)`** from `@fudic/dom` announces an event from the component; it bubbles out of the shadow root to the page. **`bus:name=@handler`** on any element of any component receives it, with the detail as the argument, typed by the receiver's parameter: `emit(\"picked\", 5)` where a receiver takes a `string` is underlined at the `emit`. Every receiver on the page hears it; for one parent, use a callback prop.\n\n**Events inside a loop: delegate.** An `@event` inside `@foreach` adds one listener per row (`FUD1380`, a warning). Put the handler on an element outside the loop, pass it the row by its loop name, and mark the element in the row with `delegate:name=\"click\"` (the events it serves, space-separated; no value serves them all). The row arrives typed, also inside an argument (`@remove(p.id, p.name)`). `$p` is `FUD1383`; a marker no handler reads for that event is `FUD1381`; outside a loop, `FUD0663`.\n\n**`$value`: the value of the control, typed.** Like `$event`, it exists only in the arguments of a handler's call, and it is the value of the control the event came from: `<input type=\"checkbox\" @change=@activate($value)>` hands `activate` a `boolean`, `<input type=\"search\" @input=@search($value)>` a `string`. A `number` gives `number | null` (empty is `null`), a `range` `number`, a `file` `File | null` (with `multiple`, `readonly File[]`), a `<select multiple>` `string[]`, any other field `string`. Delegated, it reads the element marked `delegate:<row>` that serves the handler, never the `target`: `<tbody @change=@activate(p, $value)>` with the box marked `delegate:p=\"change\"`. On an element with no value (`<div>`, `<button>`, a component tag), in `bus:` or in `@fudic:*` it is `FUD1462`; with `type=@expr`, `FUD1463`; marks of different types for one handler, `FUD1464`.\n\n**Two buttons with the same event in a row: name the handlers.** `<tbody @click.remove=@remove(p) @click.view=@view(p)>` and, in the row, `<button delegate:p=\"click.remove\">` and `<button delegate:p=\"click.view\">`. The event is what comes before the `.`, the name what comes after (`[a-z][a-z0-9-]*`, else `FUD1465`). A named handler only exists delegated (`FUD1466` if it reads no row), a mark with a name is read only by the handler of that name, and a mark without one never by a named handler: the `click` of *View* never reaches *Remove*. One listener per handler on the parent, whatever the rows.\n\n**The events of a form leave the component.** `fudic:result` and `fudic:error` cross the shadow root, so the host of a component hears what its forms announce: `<user-form @fudic:result=@added @fudic:error=@failed>`. The datum is typed by what the component's `form:=@fn` return (`-> Person` gives `added(person: Person)`), adding up what the components it uses announce; on a component with no form the handler is an error. A status the form keeps (`catches`) stays in the form and is not announced.\n\n```fud path=src/components/app-choice/app-choice.fud\n@code {\n  /** A row of buttons, one per option. Picking one calls `onPick` and announces `picked`. */\n  const { options = [], onPick } = props<{\n    /** The texts of the buttons, in order. */\n    options?: readonly string[];\n    /** Called with the option the user picked. */\n    onPick: (option: string) => void;\n  }>();\n\n  import { emit } from \"@fudic/dom\";\n\n  function pick(option: string) {\n    onPick(option);\n    emit(\"picked\", option);\n  }\n}\n\n<app-choice>\n  <template shadowrootmode=\"open\">\n    <div @click=@pick(option)>\n      @foreach (const option of options) key (option) {\n        <button type=\"button\" delegate:option=\"click\">@option</button>\n      }\n    </div>\n  </template>\n</app-choice>\n```\n\n```fud path=src/components/app-survey/app-survey.fud\n<link rel=\"component\" href=\"../app-choice/app-choice.fud\">\n\n@code {\n  /** Asks one question and shows the answer. */\n  import { signal } from \"@fudic/core\";\n\n  const options = [\"Yes\", \"No\", \"Later\"];\n  const answer = signal(\"\");\n\n  function chosen(option: string) {\n    answer.set(option);\n  }\n}\n\n<app-survey>\n  <template shadowrootmode=\"open\">\n    <app-choice .options=@options .onPick=@chosen></app-choice>\n    <p role=\"status\">@answer()</p>\n  </template>\n</app-survey>\n```\n\nAny other component on the page hears the same `emit` with `<p bus:picked=@heard>Last: @last()</p>` and `function heard(option: string) { last.set(option); }`.\n\n## Calling the server\n\nA component's server functions live in a `.fudapi` beside it: `fudic_generate { kind: \"api\", name: \"src/components/app-search\" }` writes it, its handler in `src/server` and the `<link rel=\"server\">`. Declaring functions: topic `fudapi`. In `@code` the functions are in scope by name; wrap them in `task` from `@fudic/core`:\n\n- `task(fn)` calls only on `run(args)`; `task(fn, () => ({ q: text() }), { initial: [] })` calls on every change of what the source reads, never on creation. Pass the function, not a call.\n- A GET runs as `latest` (a new call aborts the one in flight); POST, PUT, PATCH, DELETE as `queue` (one after another, in order).\n- Read in the view or in code: `value()` (the last answer, or `initial`), `pending()`, `state()` (`\"idle\"`, `\"pending\"`, `\"done\"`, `\"failed\"`, `\"cancelled\"`), `error()`, `message()` (the error's message, or `\"\"`). `cancel()` aborts the call in flight.\n- `run(args)` never rejects: `const saved = await save.run({ id: p.id, active }); if (saved.ok) { … saved.value … }`. `ok: false` is `status: \"failed\"` (with `error`) or `\"cancelled\"`.\n- On the server a task never calls: the first data comes from the page (topic `pages`) or a prop.\n\n```fudapi path=src/components/app-search/app-search.fudapi\n# The server functions of the component: their handlers are in src/server/components/app-search/app-search.ts.\nget search\n  q  str\n  -> Hit[]\n\ntype Hit\n  id    i32\n  name  str\n```\n\n```ts path=src/server/components/app-search/app-search.ts\nimport { search } from 'fudic:components/app-search/app-search';\n\nsearch.handle((ctx) => [{ id: 1, name: ctx.args.q }]);\n```\n\n```fud path=src/components/app-search/app-search.fud\n<link rel=\"server\" href=\"./app-search.fudapi\">\n\n@code {\n  /** A search box that lists the matching names as the user types. */\n  import { effect, signal, task } from \"@fudic/core\";\n\n  let field: HTMLInputElement | null = null;\n  const text = signal(\"\");\n  const found = task(search, () => ({ q: text() }), { initial: [] });\n\n  effect(() => {\n    sessionStorage.setItem(\"app-search\", text());\n  }, [text]);\n\n  function typed(e: Event) {\n    text.set((e.target as HTMLInputElement).value);\n  }\n\n  function clear() {\n    text.set(\"\");\n    field?.focus();\n  }\n}\n\n<app-search>\n  <template shadowrootmode=\"open\">\n    <input type=\"search\" aria-label=\"Name\" ref=\"@field\" value=@text() @input=@typed>\n    <button type=\"button\" @click=@clear>Clear</button>\n    @if (found.pending()) { <span role=\"status\">Searching…</span> }\n    @if (found.message() !== \"\") { <p role=\"alert\">@found.message()</p> }\n    <ul>\n      @foreach (const hit of found.value()) key (hit.id) {\n        <li>@hit.name</li>\n      }\n    </ul>\n  </template>\n</app-search>\n```\n\n**Files.** A form field `file` binds to `<input type=\"file\" control=@photoForm.photo>`, a `file[]` to one with `multiple` (`FUD1484` / `FUD1485` when they disagree; a file input on a field that is not a file is `FUD1486`). The compiler writes its `accept` from the field's rule. `photoForm.photo.set(file)` puts a file in it from code, as a drop zone does. While `form:=` sends, `photoForm.$progress()` is `{ loaded, total, phase }` (`\"up\"`, then `\"down\"`) and `null` otherwise, for a `<progress>`; `photoForm.$cancel()` stops the send. A `task` has the same `progress()`, and `cancel()`. Declaring files, and a component that uploads one: topic `fudapi`.\n\n## Forms: a form-associated control\n\nForms are declared in a `.fudapi` (`fudic_generate { kind: \"form\" }`); a component author only needs this. The control imports `@fudic/forms`: a project that has no form yet adds it first with `fudic_add { module: \"forms\" }`. A component that is a form control marks its template `formassociated`, bridges labels to its inner element with `shadowrootreferencetarget=\"<id>\"` (a static id of that template, `FUD0605`), declares a `ctrl: Control<…>` prop and binds it with `control=@ctrl`:\n\n```fud path=src/components/app-input/app-input.fud\n@code {\n  /** A text field a form binds with control=. */\n  import type { Control } from \"@fudic/forms\";\n\n  const { ctrl, type } = props<{\n    /** The form control the page binds. */\n    ctrl: Control<unknown>;\n    /** The input type: text, email, number… */\n    type?: string;\n  }>();\n}\n\n<app-input>\n  <template shadowrootmode=\"open\" formassociated shadowrootreferencetarget=\"field\">\n    <input id=\"field\" type=@type control=@ctrl>\n  </template>\n</app-input>\n```\n\nThe page writes its own label and error marker as for a native input: `<label for=\"email\">Email</label>`, `<app-input id=\"email\" .type=\"email\" control=@signup.email></app-input>`, `<small error=@signup.email></small>`. A `<label>` inside a shadow root cannot point outside it.\n\n## Lifecycle\n\nSeven functions of `@code`, not imported, like `props`. Each takes a function that receives `host`, the component's own element, and runs at its moment. Call them as statements at the top level of `@code`: inside a function, a handler, an `if`, a loop or the view is `FUD1560`; a declaration or an import with one of these names is `FUD1562`. Calling one several times adds functions, run in the order written.\n\n| Hook | Runs | Its function may return |\n|---|---|---|\n| `beforeHydrate(fn)` | painted by the server: before adopting it (`ref`s are still `null`) | — |\n| `afterHydrate(fn)` | after adopting and hooking up | its cleanup, run when the component is destroyed |\n| `beforeCreate(fn)` | created in the browser by a block of its parent: the shadow root is open and empty | — |\n| `afterCreate(fn)` | after creating and hooking up | its cleanup, run when the component is destroyed |\n| `onConnect(fn)` | each time it enters the document | its cleanup, run at the next disconnect |\n| `onDisconnect(fn)` | each time it leaves the document | — |\n| `onDispose(fn)` | once, when it is destroyed (`ref`s still valid) | — |\n\nThe order: hydrated, `@code` → `beforeHydrate` → `afterHydrate` → `onConnect`; created, `@code` → `beforeCreate` → `afterCreate` → `onConnect` when the parent inserts it. Removed: `onDisconnect` at once, then in the next microtask `onDispose` and the cleanups of `afterHydrate` / `afterCreate`. A keyed `@foreach` that reorders its rows runs `onDisconnect` and `onConnect`, never `onDispose`: what depends on being in the page goes in `onConnect`, what lasts the whole life in `afterHydrate` / `onDispose`. A child hydrates before its parent, so its `afterHydrate` runs first. `beforeHydrate`, `afterHydrate` or `onConnect` make a component hydrate when the page loads, like a top-level `effect`; one with only `onDisconnect` / `onDispose` hydrates on its first gesture, as before. A hook that throws is reported and the others still run. The server never runs them.\n\n```fud path=src/components/app-size/app-size.fud\n@code {\n  /** Its own width, kept up to date while it is in the page. */\n  import { signal } from \"@fudic/core\";\n\n  const width = signal(0);\n\n  onConnect((host) => {\n    const ro = new ResizeObserver(() => width.set(host.clientWidth));\n    ro.observe(host);\n    return () => ro.disconnect();\n  });\n\n  onDispose(() => {\n    sessionStorage.removeItem(\"app-size\");\n  });\n}\n\n<app-size>\n  <template shadowrootmode=\"open\">\n    <output>@width() px</output>\n  </template>\n</app-size>\n```\n\n```fud broken=FUD1560 path=src/components/app-late/app-late.fud\n@code {\n  function start() {\n    onConnect(() => {\n      console.log(\"connected\");\n    });\n  }\n}\n\n<app-late>\n  <template shadowrootmode=\"open\">\n    <button type=\"button\" @click=@start>Start</button>\n  </template>\n</app-late>\n```\n\n## Reflecting a prop on the host\n\nWrite an attribute with an expression on the component's own tag, and style the host by it:\n\n```fud path=src/components/app-tile/app-tile.fud\n@code {\n  /** A tile; \"highlight\" draws a gold border. */\n  const { variant = \"default\" } = props<{\n    /** How the tile is drawn. */\n    variant?: \"default\" | \"highlight\";\n  }>();\n}\n\n<head>\n  <style>\n    :host { display: block; border: 1px solid #ddd; }\n    :host([variant=\"highlight\"]) { border-color: gold; }\n  </style>\n</head>\n\n<app-tile variant=@variant>\n  <template shadowrootmode=\"open\">\n    <slot></slot>\n  </template>\n</app-tile>\n```\n\nA `string`, `number` or `bigint` is written as `String(v)`; `true` writes the attribute empty; `false`, `null` and `undefined` remove it. Anything else is a type error. It is written by the server, kept when hydrating, rewritten when the prop changes, and written when the component is created in the browser. You choose the name, and a native attribute keeps its effect: `title` puts a tooltip on the whole component, and `hidden`, `id`, `lang`, `dir` or `role` change how the host behaves. For a style variant, use a name of your own (`variant`) or a `data-*`.\n\n## Instead of… (React habits)\n\n| Instead of… | Write | Code |\n|---|---|---|\n| `className=\"card\"` | `class=\"card\"`; a changing one `class:active=@on` | `FUD1160` |\n| `htmlFor=\"email\"` | `for=\"email\"` | `FUD1160` |\n| `onClick={save}` | `@click=@save` | `FUD0909` + `FUD1161` |\n| `value={name}`, `title={x}` | `.value=@name` (property), `title=@x` (attribute) | `FUD1161` |\n| `onclick=\"save()\"` | `@click=@save` | `FUD0909` |\n| `{open && <p>…</p>}` | `@if (open) { <p>…</p> }` | `FUD1162` |\n| `{items.map(i => <li>…</li>)}` | `@foreach (const i of items) key (i.id) { <li>…</li> }` | `FUD1162` |\n| `key={i.id}` on the row | `key (i.id)` after the loop header | `FUD0540` when missing |\n| `props.title` | `const { title } = props<…>()`, then `@title` | `FUD0907` |\n| `children` | `<slot></slot>`, and `<slot name=\"x\">` for more | `FUD0907` |\n| `import Card from \"./Card\"` | `<link rel=\"component\" href=\"…\">`, then `<app-card>` | `FUD0191` |\n| `<Card {...item} />` | `<app-card ...item></app-card>` | — |\n| `useState(0)`, `setN(n + 1)` | `const n = signal(0)`, `n.set(n() + 1)` | — |\n| `useMemo(() => …, [a])` | `computed(() => …)` | — |\n| `useEffect(fn, [a])` | `effect(fn, [a])`: sources, not values | — |\n| `useRef(null)` | `let el: HTMLElement \\| null = null` and `ref=\"@el\"` | — |\n| `onChange` prop | a callback prop `.onChange=@fn`, or `emit` + `bus:` | — |\n| `fetch` in an effect | a server function in the `.fudapi`, called through `task` | — |\n| `@if (name)` truthiness | `@if (name !== \"\")` | `FUD1151` |\n| `.innerHTML=@html` | render the content with the template | `FUD0916` |\n| `useEffect(fn, [])` to run once after the first paint | `afterHydrate(fn)` (and `afterCreate(fn)` for one created in the browser) | — |\n| `useEffect` cleanup on unmount | `onDispose(fn)`, or return the cleanup from `afterHydrate` | — |\n| `connectedCallback()` / `disconnectedCallback()` in a class | `onConnect(fn)` / `onDisconnect(fn)` in `@code` | — |\n| `useEffect` / `useLayoutEffect` inside a function or a handler | the hook at the top level of `@code` | `FUD1560` |\n| `window.addEventListener('beforeunload', …)` / `'unload'` | `onDisconnect(fn)` in the route's `@code` | — |\n| `reflect: true` on a property | an attribute with an expression on the identity tag: `<app-card variant=\"@variant\">` | — |\n\n```fud broken=FUD1162 path=src/components/app-tags/app-tags.fud\n@code {\n  const { tags = [] } = props<{ tags?: readonly string[] }>();\n}\n\n<app-tags>\n  <template shadowrootmode=\"open\">\n    <ul>{tags.map(t => <li>{t}</li>)}</ul>\n  </template>\n</app-tags>\n```\n\n```fud broken=FUD1562 path=src/components/app-ping/app-ping.fud\n@code {\n  const onConnect = () => console.log(\"in\");\n}\n\n<app-ping>\n  <template shadowrootmode=\"open\">\n    <p>ping</p>\n  </template>\n</app-ping>\n```\n",
 "diagnostics": [],
 "next": null
}
```

**Modelo:** Ya tengo lo que necesito. Escribo la propuesta de props y criterios en los ficheros para que la veas en concreto.

*(Write src\components\tienda-button\tienda-button.fud)*

*(Write src\components\tienda-button\tienda-button.fixture.ts)*

*(Write src\components\tienda-button\tienda-button.fudspec)*

**Llamada:** `fudic_check` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "errors": 0,
  "warnings": 0,
  "fixable": 0,
  "files": 0
 },
 "diagnostics": [],
 "next": null
}
```

**Modelo:** Cero diagnósticos. Esto es lo que hay sobre la mesa.

## Por dónde empezamos

fudic no deja escribir la vista antes de que tú apruebes **props + criterios**, y pide ir de uno en uno. Así que: **botón → tarjeta de producto → campo de texto**, y de cada uno aprobamos primero el contrato. Los tokens de diseño ya existen (`src/guide/tokens.css`), así que no hay nada que acordar ahí.

Ya está creado `<tienda-button>` (`src/components/tienda-button/`) con esta propuesta escrita en sus ficheros:

**Props** (`tienda-button.fud:6`)

| prop | valores | por defecto | para qué |
|---|---|---|---|
| `variant` | `primary` · `secondary` · `danger` | `primary` | peso de la acción: comprar / alternativa / destructiva |
| `size` | `md` · `sm` | `md` | ficha o formulario / fila apretada |
| `type` | `button` · `submit` | `button` | enviar el formulario en el que está |
| `disabled` | sí/no | no | sin stock: se lee, no responde |
| `busy` | sí/no | no | "añadiendo…": avisa y no se pulsa dos veces |

El texto es lo que escribas entre las etiquetas. No lleva `href`: para navegar, un enlace.

**Criterios** (`tienda-button.fudspec`) — nueve, en tus palabras:

1. dice su texto, y ese texto es su nombre accesible
2. la principal lleva el color de marca
3. la alternativa es discreta
4. la destructiva avisa en rojo
5. se puede enfocar y se ve dónde está el foco
6. sin stock no responde
7. mientras trabaja avisa (indicador visible) y no se repite
8. se pulsa con el dedo (40 px de alto mínimo)
9. un texto largo se lee entero

**Dos cosas que decidir tú:**

- ¿Hace falta un `full` (ancho completo) para el botón de comprar en móvil? No lo he incluido.
- ¿`size: sm` sobra para empezar? Si solo vas a usar uno, lo quito.

¿Apruebas props y criterios tal cual, o cambias algo? En cuanto digas que sí, lo registro y paso a los tests en rojo y la vista del botón.

## Turno 2

**Persona:** Quita el tamaño sm, de momento sobra, y no hace falta ancho completo. Lo demás está bien: apruebo las props y los criterios.

**Modelo:** Aplico los dos cambios: fuera `size` (si solo hay un tamaño, el prop no pinta nada) y nada de ancho completo.

*(Edit src\components\tienda-button\tienda-button.fud)*

*(Edit src\components\tienda-button\tienda-button.fixture.ts)*

**Llamada:** `fudic_check` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "errors": 0,
  "warnings": 0,
  "fixable": 0,
  "files": 0
 },
 "diagnostics": [],
 "next": null
}
```

*(ToolSearch)*

**Llamada:** `fudic_record` 

```json
{
 "piece": "src/components/tienda-button/tienda-button.fud",
 "event": "approved"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "command": "fudic approve src/components/tienda-button/tienda-button.fud",
 "changes": [
  {
   "modify": "src/components/tienda-button/tienda-button.fudlog"
  }
 ],
 "commands": [],
 "written": true,
 "ran": [],
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_status` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "phase": "red",
 "project": {
  "name": "tienda",
  "kind": "app",
  "prefix": "tienda",
  "errorPage": {
   "from": "none"
  }
 },
 "summary": {
  "errors": 0,
  "warnings": 0
 },
 "units": [
  {
   "piece": "src/components/tienda-button/tienda-button.fud",
   "kind": "component",
   "name": "tienda-button",
   "phase": "red",
   "approval": "valid",
   "look": "none",
   "server": false,
   "tests": "not run",
   "spec": "not run",
   "documented": "4/4",
   "functions": {
    "connected": 0,
    "missing": 0
   }
  },
  {
   "piece": "src/routes/index.fud",
   "kind": "route",
   "name": "/",
   "phase": "criteria",
   "approval": "none",
   "server": false,
   "tests": "not run",
   "spec": "not run",
   "documented": "0/0",
   "functions": {
    "connected": 0,
    "missing": 0
   }
  }
 ],
 "diagnostics": [],
 "next": "Write the unit tests of src/components/tienda-button/tienda-button.fud in src/components/tienda-button/tienda-button.test.ts, then run fudic_test and fudic_spec_run: every test and every criterion must fail for the right reason (fail, not broken). Do not write the view yet. Call fudic_guide { topic: \"testing\" } first."
}
```

**Modelo:** Aprobado y registrado. Fase `red`: ahora los tests unitarios, que deben fallar por el motivo correcto antes de escribir la vista.

**Llamada:** `fudic_guide` 

```json
{
 "topic": "testing"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "testing",
 "related": [
  "fudapi",
  "fudspec"
 ],
 "body": "# testing\n\nUnit tests with `@fudic/testing` (vitest on happy-dom): mounting, queries, gestures, the in-memory server, and the boundary with the `.fudspec`.\n\n## Which goes where\n\nTwo loops. Outside, the acceptance criteria (`.fudspec`, a real browser, topic `fudspec`), which the user approves. Inside, unit tests, which you write without asking.\n\n| `.fudspec` (browser) | Unit test (happy-dom) |\n|---|---|\n| What a person would check by looking and touching | What the user does not see and would not approve |\n| One user sentence = one criterion (\"disabled does nothing\") | Each prop variant; edge values (empty, very long, `0`, HTML characters) |\n| Keyboard, focus, accessibility, visible, size and layout | The `detail` of each event |\n| | Server functions and each of their failures; each rule of a form |\n| | The options of the shadow root |\n| Approved by the user | Written by you, no approval |\n\n- **What is already a criterion is not repeated as a unit test.** If `app-tabs.fudspec` checks that a click on \"Tab B\" shows its panel, no unit test checks it again.\n- happy-dom does no layout, no real focus and no ARIA references across shadow roots: a unit test of focus, size or visibility passes without proving anything. Those are criteria.\n\n## The order: red, then the view\n\n1. Props and criteria approved (topic `fudspec`).\n2. Write the unit tests. Run `fudic_test` and `fudic_spec_run`: **both must be red for the right reason**.\n3. Write the view until both are green. In this phase **do not change the tests**: change the `.fud`.\n\nThe right red is `fail`: an assertion ran and said no. `broken` means the test never reached an assertion: the `.fud` does not compile (its `FUD` codes come with the report), an import is missing, `mount` threw, a query threw, a timeout. A broken test proves nothing; fix it before going on.\n\n`getByRole`, `getByLabelText` and `getByText` **throw** when they find no element or several: before the view exists, a test that starts with `t.click(t.getByRole(…))` is `broken`, not `fail`. Open such a test with an assertion that can fail: `expect(t.queryByRole('button', { name: '+1' })).toBeInTheDocument()`, or `expect(t.query('output')).toHaveTextContent('2')`.\n\n## Setup\n\n`fudic new` writes `vitest.config.ts` with `fudicTest()` (your `fudic()` plugin, plus the `fudic` environment) and `include: ['src/**/*.test.ts']`. A test lives next to what it tests: `src/components/app-counter/app-counter.test.ts`. `fudic_generate` writes a first green test with every component, page, layout, snippet, form and pipe.\n\n## Components: `mount`\n\n```ts\nconst t = await mount(AppCounter, { props: { start: 2 } });\n```\n\n- `import * as AppCounter from './app-counter.fud'` is what `mount` takes. A `.fud` with errors fails at import, with its diagnostics.\n- `via: 'ssr'` (default): the server's HTML, its declarative shadow roots, then hydration, as in the browser. The first click on a host not hydrated yet still counts. Props must be JSON, plus `Date` at any depth.\n- `via: 'client'`: the element created as a parent creates it; any value as a prop.\n- Other options: `url` (the page it lives in, `/` by default), `providers: [{ provide, use }]` (replace a service, on both sides), `fetch` (answer the server functions yourself), `sw: true` (a simulated Service Worker; `t.invalidated` lists what it was told to invalidate).\n- The result: `t.host` (the element), `t.root` (its shadow root), the queries and gestures, `t.props({ … })` (change props as a parent would, then wait for the repaint), `t.settled()`, `t.unmount()`.\n- An app with `\"locales\"` mounts in its first locale: pipes format and `t()` translates.\n- Lifecycle hooks run as in the browser: `via: 'ssr'` runs `beforeHydrate`, `afterHydrate` and `onConnect`; `via: 'client'` runs `beforeCreate`, `afterCreate` and `onConnect`. `t.unmount()` runs `onDisconnect` at once, and `onDispose` and the cleanups in the next microtask: `await t.settled()` before asserting on them.\n\n**Queries** reach into every shadow root below: `getByRole(role, { name })`, `getByLabelText(text)`, `getByText(text)` (throw unless exactly one), `queryByRole(role, { name })` (`null` when none), `query(selector)` (CSS, first match or `null`), `errorOf(label)` (the text of a form control's error slot, or `null`).\n\n**Gestures** resolve once everything they started has finished (requests to the in-memory server, chunks, signals): `click(el)`, `type(el, text)`, `clear(el)`, `blur(el)`, `upload(el, file | files)` (chooses files in a file input, as its dialog does: `t.upload(t.getByLabelText(\"Photo\"), new File([bytes], \"me.png\", { type: \"image/png\" }))`), `submit(form?)` (the one form under the root when none is given). There is no keyboard or focus gesture: that is a criterion.\n\nAssertions are vitest's `expect` plus jest-dom's matchers (`toBeInTheDocument`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`…).\n\n```fud path=src/components/app-counter/app-counter.fud\n@code {\n  /** A counter that starts at `start` and adds one per click. */\n  import { signal } from \"@fudic/core\";\n\n  const { start = 0 } = props<{\n    /** The first number shown. */\n    start?: number;\n  }>();\n\n  const n = signal(start);\n\n  function inc() {\n    n.set(n() + 1);\n  }\n}\n\n<app-counter>\n  <template shadowrootmode=\"open\">\n    <button type=\"button\" @click=@inc>+1</button>\n    <output>@n()</output>\n  </template>\n</app-counter>\n```\n\n```ts path=src/components/app-counter/app-counter.test.ts\nimport { expect, test } from 'vitest';\nimport { mount } from '@fudic/testing';\nimport * as AppCounter from './app-counter.fud';\n\ntest('without start, it starts at 0', async () => {\n  const t = await mount(AppCounter);\n  expect(t.query('output')).toHaveTextContent('0');\n});\n\ntest('the first click wakes it up, and counts from start', async () => {\n  const t = await mount(AppCounter, { props: { start: 2 } });\n  expect(t.query('output')).toHaveTextContent('2');\n  await t.click(t.getByRole('button', { name: '+1' }));\n  expect(t.query('output')).toHaveTextContent('3');\n});\n\ntest('a new start, from the parent, repaints', async () => {\n  const t = await mount(AppCounter, { via: 'client', props: { start: 5 } });\n  expect(t.query('output')).toHaveTextContent('5');\n  await t.click(t.getByRole('button', { name: '+1' }));\n  expect(t.query('output')).toHaveTextContent('6');\n});\n```\n\n**Prop variants from the fixture.** The fixture of the `.fudspec` is a module: import its cases instead of writing the props twice, and test what the criteria leave out. For `app-post` (topic `fudspec`), the criteria cover the link and the highlight; the default variant and an unsafe title are unit tests:\n\n```ts path=src/components/app-post/app-post.test.ts\nimport { expect, test } from 'vitest';\nimport { mount } from '@fudic/testing';\nimport fixtures from './app-post.fixture';\nimport * as AppPost from './app-post.fud';\n\ntest('without a variant, the default one', async () => {\n  const t = await mount(AppPost, { props: fixtures.base });\n  expect(t.query('article')).toHaveClass('card');\n  expect(t.query('article')).not.toHaveClass('highlight');\n});\n\ntest('a title is text, never markup', async () => {\n  const t = await mount(AppPost, { props: { title: '<b>bold</b>', href: '/' } });\n  expect(t.query('b')).toBeNull();\n  expect(t.query('h2')).toHaveTextContent('<b>bold</b>');\n});\n```\n\n**Events.** To check the `detail` of an event, add a listener before the gesture and read `(e as CustomEvent).detail`; an `emit(name, detail)` of `@fudic/dom` is heard on `document`. Remove the listener in a `finally`.\n\n## Shadow root options and the accessibility tree\n\n`shadowOf(host)` returns what the shadow root was really created with: `mode`, `delegatesFocus`, `clonable`, `serializable`, `referenceTarget` and `adoptedStyleSheets` (`'base'`, the style guide's reset every component of a new app adopts, and `'self'` for the component's own `<style>`). Check it once per `via`: the server path and the client path must agree. `outline(root)` writes what a screen reader meets, in Playwright's ARIA snapshot format: one line per element with a role, its name and its states.\n\n```fud path=src/components/app-button/app-button.fud\n@code {\n  /** A button that hands its focus to the inner button. */\n  const { label, disabled = false } = props<{\n    /** The text of the button. */\n    label: string;\n    /** A disabled button cannot be pressed. */\n    disabled?: boolean;\n  }>();\n}\n\n<head>\n  <style>\n    button { font: inherit; }\n  </style>\n</head>\n\n<app-button>\n  <template shadowrootmode=\"open\" shadowrootdelegatesfocus>\n    <button disabled=@disabled>@label</button>\n  </template>\n</app-button>\n```\n\n```ts path=src/components/app-button/app-button.test.ts\nimport { describe, expect, test } from 'vitest';\nimport { mount, outline, shadowOf } from '@fudic/testing';\nimport * as AppButton from './app-button.fud';\n\ndescribe.each(['ssr', 'client'] as const)('via %s', (via) => {\n  test('the shadow root delegates the focus and adopts its own sheet', async () => {\n    const t = await mount(AppButton, { via, props: { label: 'Save' } });\n    expect(shadowOf(t.host)).toEqual({\n      mode: 'open',\n      delegatesFocus: true,\n      clonable: false,\n      serializable: false,\n      referenceTarget: null,\n      adoptedStyleSheets: ['base', 'self'],\n    });\n  });\n});\n\ntest('disabled, a screen reader meets a disabled button named Save', async () => {\n  const t = await mount(AppButton, { props: { label: 'Save', disabled: true } });\n  expect(outline(t.root)).toBe('- button \"Save\" [disabled]');\n});\n\ntest('enabled, the same button without the state', async () => {\n  const t = await mount(AppButton, { props: { label: 'Save' } });\n  expect(outline(t.root)).toBe('- button \"Save\"');\n});\n```\n\n`outline` does not know what CSS hides: what is visible is a criterion. `renderToHtml(X)` returns the server's HTML, and `toContainTemplate({ … })` checks its `shadowroot*` attributes.\n\n## Server functions: the in-memory server\n\nNothing is mocked unless you mock it. A call from a component goes through the client chain, the wire format and the dispatcher to the real handler in `src/server`, and back. The component, its `.fudapi` and its handler (topic `fudapi`; `fudic_generate { kind: \"api\" }` writes the last two and adds `@fudic/http`):\n\n```fudapi path=src/components/app-hello/app-hello.fudapi\n# The server functions of the component: their handlers are in src/server/components/app-hello/app-hello.ts.\npost greet\n  name  str\n  -> str\n```\n\n```ts path=src/server/components/app-hello/app-hello.ts\nimport { greet } from 'fudic:components/app-hello/app-hello';\n\ngreet.handle((ctx) => `Hello, ${ctx.args.name}`);\n```\n\n```fud path=src/components/app-hello/app-hello.fud\n<link rel=\"server\" href=\"./app-hello.fudapi\">\n\n@code {\n  /** A button that asks the server for a greeting, and says why when it cannot. */\n  import { signal } from \"@fudic/core\";\n\n  const said = signal(\"\");\n  const failed = signal(\"\");\n\n  async function go() {\n    try {\n      said.set(await greet({ name: \"Ana\" }));\n    } catch (e) {\n      const status = (e as { status?: number }).status;\n      failed.set(status === undefined ? (e as Error).name : String(status));\n    }\n  }\n}\n\n<app-hello>\n  <template shadowrootmode=\"open\">\n    <button type=\"button\" @click=@go>Greet</button>\n    <output role=\"status\">@said()</output>\n    <p role=\"alert\">@failed()</p>\n  </template>\n</app-hello>\n```\n\n```ts path=src/components/app-hello/app-hello.test.ts\nimport { expect, test } from 'vitest';\nimport { mount, respond, respondProblem } from '@fudic/testing';\nimport { greet } from 'fudic:components/app-hello/app-hello';\nimport * as AppHello from './app-hello.fud';\n\ntest('the real handler answers, through the whole chain', async () => {\n  const t = await mount(AppHello);\n  await t.click(t.getByRole('button', { name: 'Greet' }));\n  expect(t.getByRole('status')).toHaveTextContent('Hello, Ana');\n});\n\ntest('an answer written by the test, in the format of the function', async () => {\n  const t = await mount(AppHello, { fetch: () => respond(greet, 'Hello, Eva') });\n  await t.click(t.getByRole('button', { name: 'Greet' }));\n  expect(t.getByRole('status')).toHaveTextContent('Hello, Eva');\n});\n\ntest('a 409 reaches the view with its status', async () => {\n  const t = await mount(AppHello, { fetch: () => respondProblem(greet, { status: 409, title: 'Conflict' }) });\n  await t.click(t.getByRole('button', { name: 'Greet' }));\n  expect(t.getByRole('alert')).toHaveTextContent('409');\n});\n\ntest('a network failure reaches the view as in a browser', async () => {\n  const t = await mount(AppHello, {\n    fetch: () => {\n      throw new TypeError('Failed to fetch');\n    },\n  });\n  await t.click(t.getByRole('button', { name: 'Greet' }));\n  expect(t.getByRole('alert')).toHaveTextContent('TypeError');\n});\n```\n\n- `fetch: (request) => Response` takes the server's place for one test: for network failures, 500s and each declared failure of a function.\n- `respond(fn, value, init?)` and `respondProblem(fn, problem)` write the `Response` in the function's own format (binary unless its chain says JSON). A `Response.json(…)` is not one a call understands.\n- A request outside `/_fudic/fn/` throws and names the URL.\n- To change what the handler sees, mock the module it reads, not the call: `vi.mock('../../data/people', () => ({ emailTaken: async (e: string) => e === 'ana@example.com' }))`.\n- One module graph serves the test, the client and the server: module state (a form object, a store signal) is shared between both sides and between the tests of a file. Reset it in a `beforeEach` (`form.$reset()`).\n- `clientGraphOf(X)` walks what the browser would download; `expect(await clientGraphOf(AppHello)).not.toReach('src/data/people.ts')` checks that server code stays out.\n\n## Forms: each rule\n\n`fudic_generate { kind: \"form\", name: \"person\" }` writes the form and its test. Test each rule of each field, and in a mounted component that `t.errorOf('Name')` shows its text after `t.submit()`.\n\n```fudapi path=src/forms/person.fudapi\n# Every field says its type, its rules and their texts; both ends take it from here.\nform personForm\n  name  str = \"\"\n    required  \"Name is required.\"\n```\n\n```ts path=src/forms/person.test.ts\nimport { expect, test } from 'vitest';\nimport { personForm } from 'fudic:forms/person';\n\ntest('asks for the name', async () => {\n  expect(await personForm.$validate()).toBe(false);\n  personForm.name.set('Ada');\n  expect(await personForm.$validate()).toBe(true);\n});\n```\n\n## Pipes\n\nA pipe is tested by calling its `format(value, locale)`:\n\n```ts path=src/pipes/initials.test.ts\nimport { expect, test } from 'vitest';\nimport initials from './initials';\n\ntest('initials gives the upper-case initials of a name', () => {\n  expect(initials.format('ada lovelace', 'en')).toBe('AL');\n  expect(initials.format('  grace   brewster hopper ', 'en')).toBe('GBH');\n  expect(initials.format('', 'en')).toBe('');\n});\n```\n\n## Pages, layouts and snippets\n\n```ts path=src/routes/index.test.ts\nimport { expect, test } from 'vitest';\nimport { visit } from '@fudic/testing';\n\ntest('answers /', async () => {\n  const page = await visit('/');\n  expect(page.status).toBe(200);\n});\n```\n\n- `visit(url)` runs the page's `load` through the test's module graph; `visit(url, { data: { … } })` skips `load`. It gives `page.status`, `page.document` and the same queries and gestures. A `load` that throws renders `_error.fud` with its status; a redirect makes `visit` throw and name the target.\n- `renderLayout(Layout, { body: '<p>body</p>', sections: { nav: '<a href=\"/\">Home</a>' } })` renders a layout around that HTML; read it in `page.document`.\n- `renderSnippet('./ui.fud', 'card(\"Hi\", tone: \"info\")')` expands a snippet, written as after `@render`, from a file relative to the test; `{ scope: { item: { id: 1 } } }` gives names its arguments can read (`'row(@item)'`).\n\n## Running them\n\n`fudic_test` runs the project's tests in process; `paths: [\"src/components/app-counter\"]` limits the files, `names: [\"…\"]` the tests, `failing: true` repeats only what did not pass last time. Only what did not pass is listed: `fail` with its file, test name, the line of the `expect` and what was expected against what came; `broken` with its diagnostics (a `.fud` that does not compile comes with its codes and its place in the `.fud`; anything else is `FUD1207` with the original message).\n\nRun `fudic_test` after every edit of the view: it takes milliseconds. `fudic_spec_run` confirms in the browser.\n",
 "diagnostics": [],
 "next": null
}
```

*(Read src\components\tienda-button\tienda-button.test.ts)*

*(Write src\components\tienda-button\tienda-button.test.ts)*

**Llamada:** `fudic_check` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "errors": 0,
  "warnings": 0,
  "fixable": 0,
  "files": 0
 },
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_test` 

```json
{
 "paths": [
  "src/components/tienda-button"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 0,
  "fail": 0,
  "broken": 8,
  "skipped": 0
 },
 "tests": [
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via ssr > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:15",
   "quote": "const t = await mount(TiendaButton, { via, props: fixtures.base });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via client > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:15",
   "quote": "const t = await mount(TiendaButton, { via, props: fixtures.base });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "por defecto no envía el formulario en el que está",
   "at": "src/components/tienda-button/tienda-button.test.ts:24:13",
   "quote": "const t = await mount(TiendaButton, { props: fixtures.base });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "con type submit, envía el formulario en el que está",
   "at": "src/components/tienda-button/tienda-button.test.ts:30:13",
   "quote": "const t = await mount(TiendaButton, { props: { ...fixtures.base, type: 'submit' } });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "sin stock, el botón de dentro está deshabilitado",
   "at": "src/components/tienda-button/tienda-button.test.ts:36:13",
   "quote": "const t = await mount(TiendaButton, { props: fixtures.deshabilitada });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "sin stock, un clic no sale del componente",
   "at": "src/components/tienda-button/tienda-button.test.ts:42:13",
   "quote": "const t = await mount(TiendaButton, { props: fixtures.deshabilitada });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "mientras trabaja, no se puede pulsar y lo anuncia",
   "at": "src/components/tienda-button/tienda-button.test.ts:58:13",
   "quote": "const t = await mount(TiendaButton, { props: fixtures.ocupada });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "en reposo no anuncia trabajo ni pone indicador",
   "at": "src/components/tienda-button/tienda-button.test.ts:65:13",
   "quote": "const t = await mount(TiendaButton, { props: fixtures.base });",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: <tienda-button> declares no prop \"$content\""
    }
   ]
  }
 ],
 "ms": 5724,
 "diagnostics": [],
 "next": "Every test must fail for the right reason: a broken test is not red. Fix what broke it — the diagnostics say what — and run fudic_test again."
}
```

**Modelo:** `$content` vale en el fixture del `.fudspec`, pero `mount` solo acepta props declarados. Los tests no necesitan el texto: paso los props a mano.

*(Write src\components\tienda-button\tienda-button.test.ts)*

**Llamada:** `fudic_test` 

```json
{
 "paths": [
  "src/components/tienda-button"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 0,
  "fail": 2,
  "broken": 6,
  "skipped": 0
 },
 "tests": [
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via ssr > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:30",
   "quote": "expect(shadowOf(t.host)).toEqual({",
   "message": "expected { mode: 'open', …(5) } to deeply equal { mode: 'open', …(5) }",
   "expected": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}",
   "got": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": false,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via client > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:30",
   "quote": "expect(shadowOf(t.host)).toEqual({",
   "message": "expected { mode: 'open', …(5) } to deeply equal { mode: 'open', …(5) }",
   "expected": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}",
   "got": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": false,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}"
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "por defecto no envía el formulario en el que está",
   "at": "src/components/tienda-button/tienda-button.test.ts:24:29",
   "quote": "expect(t.query('button')).toBeInTheDocument();",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: expect(received).toBeInTheDocument()"
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "con type submit, envía el formulario en el que está",
   "at": "src/components/tienda-button/tienda-button.test.ts:30:29",
   "quote": "expect(t.query('button')).toBeInTheDocument();",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: expect(received).toBeInTheDocument()"
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "sin stock, el botón de dentro está deshabilitado",
   "at": "src/components/tienda-button/tienda-button.test.ts:36:29",
   "quote": "expect(t.query('button')).toBeInTheDocument();",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: expect(received).toBeInTheDocument()"
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "sin stock, un clic no sale del componente",
   "at": "src/components/tienda-button/tienda-button.test.ts:42:29",
   "quote": "expect(t.query('button')).toBeInTheDocument();",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: expect(received).toBeInTheDocument()"
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "mientras trabaja, no se puede pulsar y lo anuncia",
   "at": "src/components/tienda-button/tienda-button.test.ts:58:29",
   "quote": "expect(t.query('button')).toBeInTheDocument();",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: expect(received).toBeInTheDocument()"
    }
   ]
  },
  {
   "verdict": "broken",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "en reposo no anuncia trabajo ni pone indicador",
   "at": "src/components/tienda-button/tienda-button.test.ts:65:29",
   "quote": "expect(t.query('button')).toBeInTheDocument();",
   "diagnostics": [
    {
     "code": "FUD1207",
     "severity": "error",
     "message": "could not run: expect(received).toBeInTheDocument()"
    }
   ]
  }
 ],
 "ms": 5431,
 "diagnostics": [],
 "next": "Every test must fail for the right reason: a broken test is not red. Fix what broke it — the diagnostics say what — and run fudic_test again."
}
```

**Modelo:** `toBeInTheDocument()` sobre `null` lanza en vez de fallar. Cambio el arranque de cada test por una aserción que falla limpia.

*(Edit src\components\tienda-button\tienda-button.test.ts)*

**Llamada:** `fudic_test` 

```json
{
 "paths": [
  "src/components/tienda-button"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 0,
  "fail": 8,
  "broken": 0,
  "skipped": 0
 },
 "tests": [
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via ssr > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:30",
   "quote": "expect(shadowOf(t.host)).toEqual({",
   "message": "expected { mode: 'open', …(5) } to deeply equal { mode: 'open', …(5) }",
   "expected": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}",
   "got": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": false,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via client > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:30",
   "quote": "expect(shadowOf(t.host)).toEqual({",
   "message": "expected { mode: 'open', …(5) } to deeply equal { mode: 'open', …(5) }",
   "expected": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}",
   "got": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": false,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "por defecto no envía el formulario en el que está",
   "at": "src/components/tienda-button/tienda-button.test.ts:24:33",
   "quote": "expect(t.query('button')).not.toBeNull();",
   "message": "expected null not to be null",
   "expected": "null",
   "got": "null"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "con type submit, envía el formulario en el que está",
   "at": "src/components/tienda-button/tienda-button.test.ts:30:33",
   "quote": "expect(t.query('button')).not.toBeNull();",
   "message": "expected null not to be null",
   "expected": "null",
   "got": "null"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "sin stock, el botón de dentro está deshabilitado",
   "at": "src/components/tienda-button/tienda-button.test.ts:36:33",
   "quote": "expect(t.query('button')).not.toBeNull();",
   "message": "expected null not to be null",
   "expected": "null",
   "got": "null"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "sin stock, un clic no sale del componente",
   "at": "src/components/tienda-button/tienda-button.test.ts:42:33",
   "quote": "expect(t.query('button')).not.toBeNull();",
   "message": "expected null not to be null",
   "expected": "null",
   "got": "null"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "mientras trabaja, no se puede pulsar y lo anuncia",
   "at": "src/components/tienda-button/tienda-button.test.ts:58:33",
   "quote": "expect(t.query('button')).not.toBeNull();",
   "message": "expected null not to be null",
   "expected": "null",
   "got": "null"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "en reposo no anuncia trabajo ni pone indicador",
   "at": "src/components/tienda-button/tienda-button.test.ts:65:33",
   "quote": "expect(t.query('button')).not.toBeNull();",
   "message": "expected null not to be null",
   "expected": "null",
   "got": "null"
  }
 ],
 "ms": 5270,
 "diagnostics": [],
 "next": "Every test of src/components/tienda-button/tienda-button.fud must fail for the right reason: an assertion that says no, not one that breaks. Then run fudic_spec_run."
}
```

**Modelo:** 8 fallos, 0 roto: rojo por el motivo correcto. Ahora los criterios en navegador.

**Llamada:** `fudic_spec_run` 

```json
{
 "spec": "tienda-button"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 0,
  "fail": 8,
  "error": 1
 },
 "browser": "chrome",
 "criteria": [
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "dice-su-texto",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:4:1",
   "step": "then  visible role:button/\"Añadir al carrito\"",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:8:5",
   "expected": "visible",
   "got": "not there"
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "la-principal-lleva-el-color-de-marca",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:12:1",
   "step": "then  attribute tienda-button variant \"primary\"",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:16:5",
   "expected": "variant=\"primary\"",
   "got": "no variant"
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "la-alternativa-es-discreta",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:18:1",
   "step": "then  visible role:button/\"Seguir comprando\"",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:22:5",
   "expected": "visible",
   "got": "not there"
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "la-destructiva-avisa-en-rojo",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:25:1",
   "step": "then  visible role:button/\"Vaciar el carrito\"",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:29:5",
   "expected": "visible",
   "got": "not there"
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "se-puede-enfocar",
   "verdict": "error",
   "at": "src/components/tienda-button/tienda-button.fudspec:33:1",
   "step": "when  focus role:button/\"Añadir al carrito\"",
   "diagnostics": [
    {
     "code": "FUD1202",
     "severity": "error",
     "message": "term \"focus\" ran out of time: locator.focus: Timeout 5000ms exceeded.",
     "at": "src/components/tienda-button/tienda-button.fudspec:37:5"
    }
   ]
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "sin-stock-no-responde",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:42:1",
   "step": "then  visible role:button/\"Sin stock\"",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:46:5",
   "expected": "visible",
   "got": "not there"
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "mientras-trabaja-avisa-y-no-se-repite",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:50:1",
   "step": "then  visible role:progressbar",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:54:5",
   "expected": "visible",
   "got": "not there"
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "se-pulsa-con-el-dedo",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:58:1",
   "step": "then  min-height tienda-button 40",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:62:5",
   "expected": "at least 40px",
   "got": "0px"
  },
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "un-texto-largo-se-lee-entero",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:64:1",
   "step": "then  visible role:button/\"Añadir al carrito y seguir con la compra\"",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:68:5",
   "expected": "visible",
   "got": "not there"
  }
 ],
 "ms": 25688,
 "diagnostics": [],
 "next": "A criterion that errors did not say pass or fail: fix what its diagnostics say, then run fudic_spec_run again."
}
```

**Modelo:** Un criterio en `error` no es rojo válido: `focus` sobre un elemento que aún no existe agota el tiempo. Le pongo un `then` delante que falle limpio.

*(Edit src\components\tienda-button\tienda-button.fudspec)*

**Llamada:** `fudic_check` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "errors": 0,
  "warnings": 0,
  "fixable": 0,
  "files": 0
 },
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_spec_run` 

```json
{
 "spec": "tienda-button",
 "criteria": [
  "se-puede-enfocar"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 0,
  "fail": 0,
  "error": 1
 },
 "browser": "chrome",
 "criteria": [
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "se-puede-enfocar",
   "verdict": "error",
   "at": "src/components/tienda-button/tienda-button.fudspec:33:1",
   "step": "when  focus role:button/\"Añadir al carrito\"",
   "diagnostics": [
    {
     "code": "FUD1202",
     "severity": "error",
     "message": "term \"focus\" ran out of time: locator.focus: Timeout 5000ms exceeded.",
     "at": "src/components/tienda-button/tienda-button.fudspec:39:5"
    }
   ]
  }
 ],
 "ms": 12599,
 "diagnostics": [],
 "next": "A criterion that errors did not say pass or fail: fix what its diagnostics say, then run fudic_spec_run again."
}
```

**Llamada:** `fudic_guide` 

```json
{
 "topic": "FUD1202"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "FUD1202",
 "related": [
  "fudspec"
 ],
 "body": "# FUD1202 — A step that ran out of time\n**error**\n\nA step waits for the element it acts on or looks at. The element never became ready in the step's time: it did not appear, or the page never settled.\n\n**Fix:** make the page settle: a step waits for what it acts on.\n",
 "title": "A step that ran out of time",
 "severity": "error",
 "why": "A step waits for the element it acts on or looks at. The element never became ready in the step's time: it did not appear, or the page never settled.",
 "fix": "make the page settle: a step waits for what it acts on.",
 "diagnostics": [],
 "next": null
}
```

**Modelo:** `when` siempre espera a su elemento, así que un gesto sobre la vista vacía solo puede dar error. Reescribo ese criterio para que el gesto caiga en el host (que sí existe) y compruebe lo que de verdad importa: que el foco entra en el componente y acaba en el botón.

*(Edit src\components\tienda-button\tienda-button.fudspec)*

**Llamada:** `fudic_spec_run` 

```json
{
 "spec": "tienda-button",
 "criteria": [
  "el-foco-llega-al-boton"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 0,
  "fail": 1,
  "error": 0
 },
 "browser": "chrome",
 "criteria": [
  {
   "spec": "src/components/tienda-button/tienda-button.fudspec",
   "id": "el-foco-llega-al-boton",
   "verdict": "fail",
   "at": "src/components/tienda-button/tienda-button.fudspec:33:1",
   "step": "then  focused role:button/\"Añadir al carrito\"",
   "stepAt": "src/components/tienda-button/tienda-button.fudspec:39:5",
   "expected": "focus on role:button/\"Añadir al carrito\"",
   "got": "not there"
  }
 ],
 "ms": 7580,
 "diagnostics": [],
 "next": null
}
```

**Modelo:** Rojo limpio. Pero he tocado el `.fudspec` después de tu aprobación, así que comprobemos qué dice fudic.

**Llamada:** `fudic_status` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "phase": "criteria",
 "project": {
  "name": "tienda",
  "kind": "app",
  "prefix": "tienda",
  "errorPage": {
   "from": "none"
  }
 },
 "summary": {
  "errors": 0,
  "warnings": 0
 },
 "units": [
  {
   "piece": "src/components/tienda-button/tienda-button.fud",
   "kind": "component",
   "name": "tienda-button",
   "phase": "criteria",
   "approval": "expired",
   "look": "none",
   "server": false,
   "tests": "stale (was red)",
   "spec": "fail 0/1",
   "documented": "4/4",
   "functions": {
    "connected": 0,
    "missing": 0
   }
  },
  {
   "piece": "src/routes/index.fud",
   "kind": "route",
   "name": "/",
   "phase": "criteria",
   "approval": "none",
   "server": false,
   "tests": "not run",
   "spec": "not run",
   "documented": "0/0",
   "functions": {
    "connected": 0,
    "missing": 0
   }
  }
 ],
 "expired": [
  {
   "piece": "src/components/tienda-button/tienda-button.fud",
   "since": "2f3a378",
   "diff": ""
  }
 ],
 "diagnostics": [],
 "next": "The approval of src/components/tienda-button/tienda-button.fud expired: what the user approved changed since. Show the user the diff in \"expired\", ask them to approve it again, and only then call fudic_record { piece: \"src/components/tienda-button/tienda-button.fud\", event: \"approved\" }."
}
```

**Modelo:** La aprobación ha caducado por un solo cambio, y el `diff` viene vacío (los ficheros aún no están en git), así que te lo enseño yo.

## Estado del rojo

- **Tests unitarios: 8 fallan, 0 rotos.** Cubren lo que no se ve: `type` por defecto `button` (que no envíe un formulario sin querer) y `submit` cuando se pide, el botón interno deshabilitado sin stock, que un clic deshabilitado no sale del componente, `aria-busy` + indicador mientras trabaja y nada de eso en reposo, y que el shadow root entrega el foco y adopta su hoja (por SSR y por cliente).
- **Criterios: 9 fallan, 0 errores.** Cada uno dice `not there`: el rojo correcto.

## El cambio que necesita tu visto bueno

Un criterio no funcionaba como estaba escrito: `focus` sobre el botón interno espera a que exista y agota el tiempo (`FUD1202`), lo que da **error**, no fallo, y fudic no deja seguir con un error. Lo he reescrito para que el gesto caiga en el componente, que siempre está:

```diff
-criterion se-puede-enfocar
+criterion el-foco-llega-al-boton
   given
     props base
   when
-    focus role:button/"Añadir al carrito"
+    focus tienda-button
   then
     focused role:button/"Añadir al carrito"
```

Dice más que el anterior: el foco entra por el componente y **acaba en el botón de dentro**, que es lo que pasa al tabular desde la página. Lo demás (props y los otros ocho criterios) está exactamente como lo aprobaste; el fixture no se ha tocado.

¿Lo apruebas así? Con tu sí lo registro, escribo la vista del botón hasta verde, y pasamos a la tarjeta de producto.

## Turno 3

**Persona:** Sí, así está mejor. Apruébalo y sigue con el botón.

**Llamada:** `fudic_record` 

```json
{
 "piece": "src/components/tienda-button/tienda-button.fud",
 "event": "approved"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "command": "fudic approve src/components/tienda-button/tienda-button.fud",
 "changes": [
  {
   "modify": "src/components/tienda-button/tienda-button.fudlog"
  }
 ],
 "commands": [],
 "written": true,
 "ran": [],
 "diagnostics": [],
 "next": null
}
```

**Modelo:** Aprobado. Antes de escribir la vista, las dos guías que me faltan: expresiones y CSS.

**Llamada:** `fudic_guide` 

```json
{
 "topic": "view"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "view",
 "related": [
  "pages",
  "fudapi"
 ],
 "body": "# view\n\nWhat the markup of a `.fud`, and the part of `@code` the server evaluates, may contain: a closed list that lowers with the same meaning to TypeScript, C#, Java, Go, Rust and Python.\n\n## The rule\n\nThe view fills holes; it does not program. Anything not listed here is an error, even if it is valid JavaScript. \"It works in JS\" is never the test: the test is whether the compiler can lower it to every backend language.\n\nThe list applies to:\n\n- `@(expr)`, the implicit `@name`, `@a.b`, `@count()`, and `@raw(expr)`;\n- every attribute value, `.prop=`, `class:`, `style:`, `ref`, `control`, `error=`;\n- the headers of `@if`, `@switch`, `case`, `@foreach`, `@for`, `@while` and their `key ( … )`;\n- the arguments of `@render`;\n- `@{ … }`;\n- what the view reads of `@code`, transitively (below).\n\nIt does **not** apply to event handlers (`@click=@(…)`, `bus:x=@f`) or to a callback prop (`.onPick=@chosen`): those are plain TypeScript that only runs in the browser. Put JS-only logic there, or compute values in a `computed`, in the page's `load()` (topic `pages`) or in a pipe.\n\n## Values and names\n\n- Literals: strings (`\"active\"`), numbers in any JS notation except `bigint` (`3.5`, `1e3`, `0x10`, `1_000`), `true`, `false`, `null`.\n- `undefined` is the one global. `Math`, `JSON`, `Date`, `Intl`, `Number`, `String`, `Object`, `NaN`, `window`, `document`, `console` are `FUD0907`.\n- Names: what the template declares, what `@code` declares, and `data` in a page.\n- `null` and `undefined` mean the same: **absent**. `x === null` and `x === undefined` both ask \"is it missing?\".\n- All arithmetic is 64-bit float, as in JS.\n\n## Operators\n\n| Operator | Operands |\n|---|---|\n| `+` | two numbers (sum), or a string with a string or a number (join) |\n| `- * / %`, unary `-` | numbers; `%` keeps the sign of the dividend |\n| `===`, `!==` | two primitives of the same type, or one side `null`/`undefined` |\n| `<`, `<=`, `>`, `>=` | two numbers, two strings or two dates |\n| `&&`, `\\|\\|`, `!` | booleans only |\n| `a ?? b` | `a` may be absent |\n| `c ? a : b` | `c` is a boolean |\n| `a \\| pipe` | a pipe (below) |\n\nNot allowed (`FUD1142`): `==`, `!=`, `typeof`, `instanceof`, `in`, `void`, unary `+`, `~`, `&`, `^`, `<<`, `>>`, `>>>`, `**`. Assignment, `++`, `--`, `delete` are `FUD0900` (only `@{ }` reassigns). The comma operator is `FUD0906`. A regex literal is `FUD0919`.\n\n**No truthiness.** Conditions, the operands of `&&`, `||`, `!`, and the arrow of `filter` are booleans (`FUD1151`). What counts as true for `\"\"`, `0` or an empty list differs between languages.\n\n- `@if (name)` → `@if (name !== \"\")` or `@if (name !== null)`.\n- `title || \"Untitled\"` → `title ?? \"Untitled\"`.\n- `count && \"…\"` → `count > 0 ? \"…\" : \"\"`.\n- \"Nothing to show\" → `@empty` (below).\n\n**Strings and dates compare with `<`.** Strings compare by UTF-16 code unit, as JS does (`\"Z\" < \"a\"` is `true`); there is no dictionary order by language. Dates compare by instant. Never subtract two dates: compare them.\n\n## Calls: only reactive reads\n\nThe one call the view makes is reading a reactive value, with no arguments: a `signal`, a `computed`, a form or one of its controls (`count()`, `form.$valid()`, `field.errors()`, `field.pending()` while a remote rule has not answered: `@if (form.alias.pending()) { <small>Checking…</small> }`). Plus `t(\"…\")` from `@fudic/i18n`, only as the value of a prop; the link of a server function, `photo.url({ id: p.id })` (an object of plain fields, or `url()` with no arguments), anywhere; and the five collection operations.\n\nEverything else is `FUD1140`: a function of `@code` (`@format(x)`), an import, a method of any prototype (`find`, `some`, `includes`, `join`, `sort`, `slice`, `toFixed`, `toUpperCase`, `toLocaleString`), a call with `?.()`. `new` is `FUD1141`. An arrow anywhere except as the argument of a collection operation, and a tagged template, are `FUD0905`. `as`, `satisfies`, `x!` and type arguments are `FUD1144`. An object or array literal is `FUD1143`.\n\n## Access and text\n\n- `a.b`, `a?.b`: a field of a typed object (props, `data`, a `.fudapi` type, a form).\n- `xs[i]`, `xs?.[i]`: `i` is a number; out of range is absent.\n- `m[k]`: `m` is a map (`Record`); a missing key is absent. `post[\"title\"]` on an object that is not a map is `FUD1153`.\n- Templates without a tag: `` `/blog/${post.slug}` ``; each hole a string or a number.\n- `@(x)` paints a string, a number, a boolean or nothing (absent). A date is painted only through a pipe.\n\n## Control\n\n- `@if (c) { … } else if (c) { … } else { … }`, `c` boolean.\n- `@switch (x) { case \"a\": … case \"b\": … default: … }`: `x` is a string, a number or a union of literals; each `case` is a literal (`FUD1148`).\n- `@foreach (const x of xs) key (x.id) { … }`: `xs` is a list; the key is a string or a number. Destructuring works in the header: `@foreach (const { id, title, author: { name: who }, featured = false } of posts) key (id)`.\n- `@for (let i = 0; i < n; i++) key (i) { … }`: the step writes only the variables its header declares.\n- `@while (c) key (k) { … }`: its body must write what `c` reads (`FUD0913`).\n- Every loop needs its `key ( … )` (`FUD0540`).\n- `@empty { … }` goes right after the closing brace of a loop and renders when the loop makes no turn (`FUD1149` elsewhere or twice). It does not see the loop variable.\n- `@{ … }` holds `const`/`let` (object destructuring allowed) and reassignments of a variable (`x = e`, `x += e`, `x++`). No `if`, loops, calls or member writes (`FUD0908`, `FUD0900`). A name it declares is seen after it, in the same block.\n- `@raw(html)` writes markup and must be the only content of its element (`FUD0990`). It only writes elements for a value marked with `trustedHtml(…)` in `@code`; any other string is written escaped.\n- Destructuring and rest: object patterns only (`FUD1146` for `[a, b]` or `{ [k]: v }`). A `...rest` is read by field (`rest.title`), spread on a tag (`<input ...rest>`, `<app-card ...rest>`) or destructured again; anything else is `FUD1147`.\n\n## Collections: five pieces\n\n`filter`, `map`, `reduce` (always with its initial value), `toSorted` and `.length`. They never modify the list. Each takes one arrow with an expression body and plain parameters: `x` or `(x, i)` for `filter`/`map`, `(acc, x)` or `(acc, x, i)` for `reduce`, `(a, b)` for `toSorted`. A block body, a function name (`xs.filter(isValid)`), an extra parameter or argument, or a `reduce` without its initial value is `FUD1145`. `map` returns a value or a field, never an object literal (`FUD1143`). `.length` works on a list and on a string, not on a map (`FUD1153`).\n\n| Need | Write |\n|---|---|\n| count all | `tasks().length` |\n| count matching | `tasks().filter(t => t.priority === 1).length` |\n| any? (`some`) | `tasks().filter(t => t.priority === 1).length > 0` |\n| all? (`every`) | `tasks().filter(t => !t.done).length === 0` |\n| contains? (`includes`) | `tags.filter(t => t === \"urgent\").length > 0` |\n| first matching (`find`) | `tasks().filter(t => t.id === selected())[0]` (absent if none) |\n| first three (`slice`) | `tasks().filter((t, i) => i < 3)` |\n| one field | `tasks().map(t => t.title)` |\n| sum | `lines.reduce((s, l) => s + l.price * l.quantity, 0)` |\n| max / min | `notes.reduce((m, n) => n > m ? n : m, 0)` · `notes.reduce((m, n) => n < m ? n : m, 10)` |\n| average | `notes.length > 0 ? notes.reduce((s, n) => s + n, 0) / notes.length : 0` |\n| join text (`join`) | ``authors.reduce((s, a, i) => i === 0 ? a.name : `${s}, ${a.name}`, \"\")`` |\n| sort by number | `tasks().toSorted((a, b) => a.priority - b.priority)`; reversed `b.price - a.price` |\n| sort by text or date | `xs.toSorted((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0)` |\n| chain | `lines.filter(l => !l.paid).map(l => l.price * l.quantity).reduce((s, x) => s + x, 0)` |\n| characters left | `@(140 - text().length)` |\n\nA comparator must return `0` for equal items and opposite signs when `a` and `b` swap: `(a, b) => a.title < b.title ? -1 : 1` is wrong. `toSorted` is stable. Grouping, removing duplicates, flattening, reversing and concatenating build new lists: do them in `load()` or a handler.\n\n## What the server evaluates of `@code`\n\n`@code` is browser code, but the server evaluates every declaration the view reads, transitively. Each must have one of these forms (else `FUD1150`, on the declaration):\n\n- `const { a, b = 1, ...rest } = props<T>()`;\n- `const x = signal(v)` or `signal<T>(v)`, with `v` from this list, a data literal or `now()`;\n- `const x = computed(() => e)`, with `e` from this list;\n- `const x = e` or `let x = e`, with `e` from this list, a data literal or a catalogue call: `signal`, `computed`, `props`, `inject(Token)`, `trustedUrl`, `trustedHtml`, the pipe presets with literal options, `t()`, and a pipe of your own called with literal parameters;\n- `import` from the project (a store of signals, a module whose `export default` is a data literal, a pipe), from `fudic:<id>` (a `.fudapi`), a catalogue name from a `@fudic/*` package, or a fudic library. Any other package is `FUD1150`.\n\nA data literal is a list of primitives (`[\"a\", \"b\"]`) or an object/array literal whose type is named: a `type` of a `.fudapi`, or the props of a component. `now()` is allowed only as the whole argument of `signal(…)` (`FUD0912`): the server evaluates it once per render, and the browser that hydrates reads the same instant. Move it on from a handler: `shown.set(new Date())`.\n\nFunctions, `effect` and everything the view does not read are not restricted.\n\n## Portable types\n\nWhat the view and those declarations read is typed with: `string`, `number`, `boolean`, `Date`; unions of string literals; `T | null`, `T | undefined`, `x?: T`; `readonly T[]` and `T[]`; `Readonly<Record<string, V>>` (a map); a `type` or `enum` of a `.fudapi`; the props of a component; `Signal<T>`, `Computed<T>`, a pipe, forms and their controls. A function type only for a callback prop. An anonymous nested object, a tuple, a class, `Map`, `Set`, `any` or `unknown` is `FUD1153`. Declare data types in the component's `.fudapi` (topic `fudapi`).\n\n## A component that uses the list\n\n```fudapi path=src/components/app-tasks/app-tasks.fudapi\n# The tasks the list shows.\ntype Task\n  id        i32\n  title     str\n  priority  i32\n  done      bool\n  created   date\n```\n\n```fud path=src/components/app-tasks/app-tasks.fud\n<link rel=\"server\" href=\"./app-tasks.fudapi\">\n\n@code {\n  /** The tasks, by priority, with how many are done. Ticking one moves the counters. */\n  import { computed, date, now, signal } from \"@fudic/core\";\n  import type { Task } from \"fudic:components/app-tasks/app-tasks\";\n\n  const { initial = [] } = props<{\n    /** The tasks to start with. */\n    initial?: readonly Task[];\n  }>();\n\n  const tasks = signal<readonly Task[]>(initial);\n  const done = computed(() => tasks().filter(t => t.done).length);\n  const pending = computed(() => tasks().filter(t => !t.done).length);\n  const byPriority = computed(() => tasks().toSorted((a, b) => a.priority - b.priority));\n  const shown = signal(now());\n  const short = date({ dateStyle: \"short\", timeZone: \"Europe/Madrid\" });\n\n  function toggle(t: Task) {\n    tasks.set(tasks().map(x => x.id === t.id ? { ...x, done: !x.done } : x));\n  }\n}\n\n<app-tasks>\n  <template shadowrootmode=\"open\">\n    <p class=\"count\">Done: @done() · Pending: @pending()</p>\n    <ul @change=@toggle(t)>\n      @foreach (const t of byPriority()) key (t.id) {\n        <li>\n          <label>\n            <input type=\"checkbox\" .checked=@t.done delegate:t=\"change\">\n            @t.title\n            <small>@(t.created | short), @(t.created < shown() ? \"past\" : \"upcoming\")</small>\n          </label>\n        </li>\n      } @empty {\n        <li>No tasks.</li>\n      }\n    </ul>\n    <button type=\"button\" @click=@(() => tasks.set([]))>Clear</button>\n    <p>Shown at @(shown() | short)</p>\n  </template>\n</app-tasks>\n```\n\nThe server evaluates the two `computed` and paints the counts; in the browser, ticking a box runs the handler (free TypeScript: `{ ...x }` is fine there) and the counts repaint.\n\n## Pipes: formatting\n\nA pipe formats a value as text in the page's locale (an app without `\"locales\"` is `en`). The presets come from `@fudic/core`: `date` (requires `timeZone`), `number`, `currency`, `percent`, `relativeTime`, `list`. Fix their options in `@code` with literals; the view only writes `|`:\n\n- `const euros = currency(\"EUR\");` → `@(total() | euros)`\n- `const twoDecimals = number({ minimumFractionDigits: 2, maximumFractionDigits: 2 });` → `@(price | twoDecimals)`\n- `const long = date({ dateStyle: \"long\", timeZone: \"Europe/Madrid\" });` → `@(published | long)`\n\nWithout parentheses the pipe binds to the value: `@name|initials`.\n\nA pipe of your own: `fudic_generate { kind: \"pipe\", name: \"initials\", on: \"str\" }` writes its contract, its one implementation and a test in `src/pipes`. The same file formats on the server and in the browser.\n\n```fudapi path=src/pipes/initials.fudapi\n# The initials of a name, upper case: \"ada lovelace\" → \"AL\".\npipe initials\n  on str\n```\n\n```ts path=src/pipes/initials.ts\nimport { initials } from 'fudic:pipes/initials';\n\nexport default initials.implement((value, locale) =>\n  value\n    .split(/\\s+/u)\n    .filter((word) => word !== '')\n    .map((word) => word.charAt(0).toLocaleUpperCase(locale))\n    .join(''),\n);\n```\n\n```fud path=src/components/app-author/app-author.fud\n@code {\n  /** The author of a post, with a round badge of their initials. */\n  import initials from \"../../pipes/initials\";\n\n  const { name } = props<{\n    /** The author's full name. */\n    name: string;\n  }>();\n}\n\n<app-author>\n  <template shadowrootmode=\"open\">\n    <p><abbr title=@name>@(name | initials)</abbr> @name</p>\n  </template>\n</app-author>\n```\n\nA pipe declared with parameters (`max u32` under `on str`) is implemented as `(value, { max }, locale) => …`, and the view uses it configured once in `@code`: `const short = truncate({ max: 40 });` → `@(summary | short)`.\n\n## Instead of… (JS habits)\n\n| Instead of… | Write | Code |\n|---|---|---|\n| `xs.find(x => x.id === id)` | `xs.filter(x => x.id === id)[0]` | `FUD1140` |\n| `xs.some(x => x.ok)` | `xs.filter(x => x.ok).length > 0` | `FUD1140` |\n| `xs.every(x => x.ok)` | `xs.filter(x => !x.ok).length === 0` | `FUD1140` |\n| `xs.includes(v)` | `xs.filter(x => x === v).length > 0` | `FUD1140` |\n| `names.join(\", \")` | ``names.reduce((s, n, i) => i === 0 ? n : `${s}, ${n}`, \"\")`` | `FUD1140` |\n| `xs.sort(cmp)` | `xs.toSorted(cmp)` | `FUD1140` |\n| `xs.slice(0, 3)` | `xs.filter((x, i) => i < 3)` | `FUD1140` |\n| `n.toFixed(2)`, `d.toLocaleDateString()` | a `number` or `date` pipe | `FUD1140` |\n| `s.toUpperCase()`, `String(n)` | a pipe of your own; `@n` paints a number | `FUD1140` |\n| `format(x)` (a function of `@code`) | `computed(() => …)` with the list, or a pipe | `FUD1140` |\n| `new Date()` | `const shown = signal(now())` in `@code` | `FUD1141` |\n| `Math.max(a, b)`, `JSON.stringify(x)`, `window.innerWidth` | `a > b ? a : b`; compute the rest in a handler or `load()` | `FUD0907` |\n| `@if (name)`, `@if (items.length)` | `@if (name !== \"\")`, `@empty` | `FUD1151` |\n| `title \\|\\| \"Untitled\"` | `title ?? \"Untitled\"` | `FUD1151` |\n| `ok && \"Saved\"` | `ok ? \"Saved\" : \"\"` | `FUD1151` |\n| `a == b`, `a != b` | `a === b`, `a !== b`; presence `x === null` | `FUD1142` |\n| `typeof x === \"string\"` | a typed value from the `.fudapi` | `FUD1142` |\n| `x ** 2` | `x * x` | `FUD1142` |\n| `{ a: 1 }` or `[1, 2]` in the markup | a `const` in `@code` with a named type | `FUD1143` |\n| `x as string`, `x!` | type it where it is declared | `FUD1144` |\n| `xs.reduce((a, b) => a + b)` | `xs.reduce((a, b) => a + b, 0)` | `FUD1145` |\n| `xs.filter(isValid)` | `xs.filter(x => x.valid)` | `FUD1145` |\n| `const [first, second] = pair` | an object pattern | `FUD1146` |\n| `i++`, `x = 1` in an expression | `@{ x = 1; }` | `FUD0900` |\n| a tagged template, an arrow outside a collection operation | markup with `@x`; the arrow in a handler | `FUD0905` |\n| `/\\d+/.test(s)` | compute it in `load()` | `FUD0919`, `FUD1140` |\n\nTernaries and untagged template literals are allowed, as long as the condition is a boolean and each hole is a string or a number.\n\n```fud broken=FUD1140 path=src/components/app-authors/app-authors.fud\n@code {\n  const { authors = [] } = props<{ authors?: readonly string[] }>();\n}\n\n<app-authors>\n  <template shadowrootmode=\"open\">\n    <p>By @(authors.join(\", \"))</p>\n  </template>\n</app-authors>\n```\n\nFixed: `<p>By @(authors.reduce((s, a, i) => i === 0 ? a : `${s}, ${a}`, \"\"))</p>`.\n\n```fud broken=FUD1151 path=src/components/app-greeting/app-greeting.fud\n@code {\n  const { name = \"\" } = props<{ name?: string }>();\n}\n\n<app-greeting>\n  <template shadowrootmode=\"open\">\n    @if (name) {\n      <p>Hello, @name</p>\n    }\n  </template>\n</app-greeting>\n```\n\nFixed: `@if (name !== \"\") { … }`.\n\n```fud broken=FUD1141 path=src/components/app-due/app-due.fud\n@code {\n  const { due } = props<{ due: Date }>();\n}\n\n<app-due>\n  <template shadowrootmode=\"open\">\n    <p>@(new Date() > due ? \"Late\" : \"On time\")</p>\n  </template>\n</app-due>\n```\n\nFixed: `import { now, signal } from \"@fudic/core\"; const today = signal(now());` in `@code`, then `@(today() > due ? \"Late\" : \"On time\")`.\n\nAfter every write, `fudic_check`; a code you do not understand, `fudic_guide { topic: \"FUD1140\" }`.\n",
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_guide` 

```json
{
 "topic": "html-css"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "topic": "html-css",
 "related": [
  "pages"
 ],
 "body": "# html-css\n\nThe HTML fudic accepts, the one `<style>` of a component and how it is scoped, styles shared by\nevery component, and design tokens.\n\n## A strict HTML subset\n\nfudic parses a strict subset of HTML. It does **no HTML5 error recovery**: nothing is closed,\ninserted or dropped for you; each mistake is a diagnostic.\n\n| Rule | Code when broken |\n|---|---|\n| Close every element explicitly: `<li>One</li>`, `<p>…</p>` | `FUD0052` |\n| No close tag without its open tag | `FUD0051` |\n| Void elements take no close tag: `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr` | `FUD0053` |\n| Self-closing is allowed on any element: `<div/>` is `<div></div>` | — |\n| Quote every attribute value: `class=\"card\"` | `FUD0056` |\n| Close every quoted value | `FUD0015` |\n| One attribute of each name per element (case-sensitive) | `FUD0190` |\n| Character references: only `&lt;` `&gt;` `&amp;` `&quot;` `&apos;` and numeric ones (`&#160;`, `&#x2014;`). Type any other character as itself: `é`, `…`, `—` | `FUD0057` |\n| A literal `<` in text is `&lt;`. A lone `&` (`Fish & Chips`) is fine | `FUD0013` |\n| `@` always starts a fudic construct. A literal at sign is `@@` | `FUD0010` |\n| `<![CDATA[ … ]]>` only inside `<svg>` or `<math>` | `FUD0054` |\n\nTwo values may go without quotes, and only these two:\n\n- a value that is **one** `@` expression: `href=@url`, `@click=@save`, `class:on=@active`;\n- the value of a `.prop` that is a scalar literal: `.count=3`, `.open=true`, `.note=null`.\n\n`id=main` is `FUD0056`. `.name=Hello` is `FUD0056` too: a bare name is not a string.\n`<!-- … -->` goes to the output as written; a fudic comment `@* … *@` is never emitted.\n`<svg>` and `<math>` switch to their own mode: case-sensitive names, self-closing tags XML-style.\n\n### Unclosed elements\n\n```fud broken=FUD0052 path=src/components/app-steps/app-steps.fud\n<app-steps>\n  <template shadowrootmode=\"open\">\n    <ol>\n      <li>Choose a table\n      <li>Confirm the booking\n    </ol>\n  </template>\n</app-steps>\n```\n\n### Unquoted values\n\n```fud broken=FUD0056 path=src/components/app-note/app-note.fud\n<app-note>\n  <template shadowrootmode=\"open\">\n    <p class=note><slot></slot></p>\n  </template>\n</app-note>\n```\n\n### Named references outside the subset\n\n```fud broken=FUD0057 path=src/components/app-price/app-price.fud\n<app-price>\n  <template shadowrootmode=\"open\">\n    <p>Price&nbsp;list</p>\n  </template>\n</app-price>\n```\n\nWrite `&#160;` for a non-breaking space.\n\n## What the markup may not hold\n\n| Written | Instead | Code |\n|---|---|---|\n| `onclick=\"…\"` or any `on*` attribute | `@click=@save` | `FUD0909` |\n| `className`, `htmlFor` | `class`, `for` | `FUD1160` |\n| `value={x}` | `.value=@x`, `title=\"@x\"`, `@click=@save` | `FUD1161` |\n| `{items.map(…)}` or `{open && …}` in the markup | `@foreach (…) key (…) { … }`, `@if (…) { … }` | `FUD1162` |\n| A `<script>` with code in its body | `<script type=\"module\" src=\"/app.js\"></script>` | `FUD0161` |\n| `href=\"javascript:…\"`, `srcdoc`, a dynamic `style=\"…\"` | a plain URL, a component, `style:width=@w` | `FUD0915` |\n| `.innerHTML=@html` | render it with the template; every value is escaped | `FUD0916` |\n| `data-fud-id` and other `data-fud-*` names | your own `data-*` name | `FUD0294` |\n\nA `<script>` whose body is data stays inline: `type=\"application/ld+json\"` and `type=\"importmap\"`.\n\n## The shape of a component\n\nA component `.fud` has a fixed top level, in this order (`FUD0155`):\n\n1. `<link rel=\"component\" href=\"…\">` for each component it uses;\n2. one `@code { … }`, if it has one;\n3. one `<head>` holding **one** `<style>` (`FUD0159`);\n4. the host: one element named with the component's tag (`FUD0156`), whose only child is\n   `<template shadowrootmode=\"open\">` (`FUD0157`; `closed` is `FUD0158`).\n\nA file that starts with `<!DOCTYPE html>` is a layout, not a component: a full\ndocument with `<html>`, `<head>` and `<body>` (`FUD0150`, `FUD0151`). See `pages`.\n\n## The component's `<style>`\n\nThe `<style>` in the `<head>` of a component is its own stylesheet, adopted into its shadow\nroot. It is **plain CSS**:\n\n- nesting, `@media`, `@container`, `@supports`, `@layer`, `@keyframes` and the other CSS\n  at-rules work as in any stylesheet;\n- no fudic construct inside it: any other `@` is `FUD0132`;\n- no `@import` (`FUD0855`); braces must balance (`FUD0131`).\n\nWhat changes with state goes in the markup, never in the CSS: a class that comes and goes is\n`class:highlight=@(variant === 'highlight')`, one property is `style:width=@width`. `class:` goes\non an element inside the template, never on the host tag (`FUD0720`).\n\nNone of the three ways a class changes —`class:x=@cond`, `class=@expr` and the `class` of a\nspread— rewrites the whole attribute: each one adds and removes only its own tokens, so a class\nsome other code put on the element (a `ref`, a library, an animation) stays. A token written both\nstatic and with `class:` (`class=\"on\" class:on=@x`) follows `class:`. As painted, the tokens come\nin this order: static, then `class=@expr`, then the active `class:` in source order; after a few\nchanges the order may differ, which CSS never sees.\n\n```fud broken=FUD0132 path=src/components/app-meter/app-meter.fud\n<head>\n  <style>\n    .bar { width: @width; }\n  </style>\n</head>\n\n<app-meter>\n  <template shadowrootmode=\"open\">\n    <div class=\"bar\"></div>\n  </template>\n</app-meter>\n```\n\n```fud broken=FUD0159 path=src/components/app-tag/app-tag.fud\n<head>\n  <style>\n    .tag { font-size: 0.75rem; }\n  </style>\n  <style>\n    .tag { color: #444; }\n  </style>\n</head>\n\n<app-tag>\n  <template shadowrootmode=\"open\">\n    <span class=\"tag\"><slot></slot></span>\n  </template>\n</app-tag>\n```\n\n## Scoping, `:host`, `::slotted()`, parts\n\nShadow DOM scopes the stylesheet: a selector in a component's `<style>` matches only inside\nthat component's shadow root. The page's CSS does not reach in, and a component's CSS does not\nleak out. Inherited properties (`color`, `font`) and custom properties do cross the boundary.\n\n- **`:host`** is the component's own tag. A custom element is `display: inline` unless you say\n  otherwise: give it `display: block` or `inline-block`.\n- **`::slotted(selector)`** styles the top-level elements the user put into a slot. They live\n  in the page, not in the shadow root.\n- **`part=\"name\"`** on an element of the template exposes it. Whoever uses the component styles\n  it from outside with `app-card::part(title) { … }`. `fudic_describe` lists a component's parts.\n\n```fud path=src/components/app-card/app-card.fud\n@code {\n  /** A card with a title. Whatever is written inside the tag fills it, under the title. */\n  const { title } = props<{\n    /** The heading of the card: one short line. */\n    title: string;\n  }>();\n}\n\n<head>\n  <style>\n    :host {\n      display: block;\n    }\n    .card {\n      border: 1px solid var(--app-color-line);\n      border-left: 3px solid var(--app-color-accent);\n      border-radius: var(--app-radius);\n      padding: var(--app-pad);\n      h2 {\n        margin: 0 0 0.35rem;\n        font-size: 1.05rem;\n      }\n    }\n  </style>\n</head>\n\n<app-card>\n  <template shadowrootmode=\"open\">\n    <article class=\"card\">\n      <h2 part=\"title\">@title</h2>\n      <slot></slot>\n    </article>\n  </template>\n</app-card>\n```\n\n```fud path=src/components/app-label/app-label.fud\n<head>\n  <style>\n    ::slotted(label) { font-weight: 500; }\n  </style>\n</head>\n\n<app-label>\n  <template shadowrootmode=\"open\">\n    <slot></slot>\n  </template>\n</app-label>\n```\n\n## Styles shared by every component\n\nA stylesheet listed in `fudic.json` is adopted into the shadow roots of the project's\ncomponents. Create one with `fudic_generate { kind: \"style\", name: \"theme\" }`: it writes\n`theme.css` at the project root and lists it under `globalStyles`.\n\n```json path=fudic.json\n{\n  \"id\": \"app\",\n  \"kind\": \"app\",\n  \"prefix\": \"app\",\n  \"server\": \"src/server\",\n  \"browser\": \"src/browser\",\n  \"globalStyles\": {\n    \"theme\": \"theme.css\"\n  }\n}\n```\n\n- **`globalStyles`**: adopted by **every** component of the project.\n- **`styles`**: adopted only by a component that names it in its template:\n  `<template shadowrootmode=\"open\" shadowrootadoptedstylesheets=\"panel\">`, with\n  `\"styles\": { \"panel\": \"src/styles/panel.css\" }` in `fudic.json`. A name that is not declared\n  there is `FUD0744`; the names are plain text, never an `@` expression (`FUD0745`).\n\nThe order is the cascade: the global styles of the libraries the project uses (in dependency\norder), then the project's `globalStyles`, then the `styles` the component names, then the\ncomponent's own `<style>`. The guide defines, the component adjusts.\n\nThese sheets live inside shadow roots, so:\n\n- write `:host`, never `body`, `html` or `:root` (`FUD0743`);\n- no `@import` (`FUD0854`): list each file in `fudic.json` instead;\n- with no component yet, `FUD0742` warns that nothing adopts them.\n\n**An app's sheets reach only the components that app defines.** A library's component looks the\nsame in every app; an app can change only the custom properties it reads.\n\nThe light DOM of a page (the markup of routes and layouts, outside every component) is styled\nby a stylesheet the layout links in its `<head>`: `<link rel=\"stylesheet\" href=\"../styles/main.css\">`.\n\n## Design tokens\n\nA token is a custom property declared directly in a `:host` or `:root` rule (also inside\n`@layer`) of a sheet listed in `globalStyles` or `styles`, or imported by the style guide, of the\nproject or of a library it uses. A custom property declared in any other rule is local to that\nrule, not a token. The guide's tokens are on `:root`, in the page: custom properties cross into\nevery shadow root.\n\nDocument each token the way a prop is documented: a `/** … */` right above its declaration.\nName it `--<prefix>-<group>-<name>`: the second segment is its group (`color`, `space`).\n\n```css path=theme.css\n/* Adopted inside every component of app: write :host, not body. */\n:host {\n  /** Body text. Use it for anything read, never for a border. */\n  --app-color-ink: #1c1c1e;\n  /** Hairlines and borders that separate, without drawing attention. */\n  --app-color-line: #dcdcdc;\n  /** The one colour that marks what matters: a link, an active item, a card's edge. */\n  --app-color-accent: #0b5fff;\n  /** Corner radius of a surface. Smaller elements inside it use none. */\n  --app-radius: 10px;\n  /** Padding inside a surface, block then inline. */\n  --app-pad: 1rem 1.15rem;\n}\n```\n\n- **Before writing any style, call `fudic_symbols { kind: \"tokens\" }`** and use only those\n  names. Each entry has its `value`, `group`, `doc` and where it comes from. `fudic_describe`\n  takes one token name.\n- No literal colour, radius or spacing when a token says it; ask the user before adding one.\n\n## The style guide\n\nEvery project starts with one: a standalone app has it in `src/guide/`, a workspace in\n`libs/guide`, and every app and library the workspace creates depends on it.\n`fudic_generate { kind: \"guide\" }` creates one where there is none. It is named in `fudic.json`:\n\n```json path=libs/guide/fudic.json\n{\n  \"kind\": \"lib\",\n  \"globalStyles\": { \"base\": \"base.css\" },\n  \"guide\": { \"sheet\": \"guide.css\", \"icon\": \"logo.svg\" }\n}\n```\n\n`guide.css` is only `@import`s: `tokens.css` (the tokens on `:root`, the font), `document.css`\n(`html` and `body`), `base.css`, and then **one piece per element**: `h1.css`, `button.css`,\n`input.css`, `table.css`…\n\n- **The page gets the whole guide.** Every page of a project whose chain holds it links it,\n  pruned to what the page uses, before the sheets of its layout. No `<link>` to write: depending\n  on the library is enough. Its `icon` is the favicon of every page whose `<head>` has none.\n- **A component gets only the pieces it names**, by file name, in its root template:\n\n```html\n<template shadowrootmode=\"open\" shadowrootadoptedstylesheets=\"button input\">\n```\n\n- **The attribute is the truth**: the build adopts exactly what it says. When you write an\n  element a piece styles, add the piece. `FUD1440` warns of a piece missing for an element\n  of the template, and its repair adds it — `fudic_fix` applies it. `FUD1441` warns of an adopted\n  piece that styles nothing in the template. **Never remove a piece on your own**: a script may\n  create what it styles. Its repair is the user's to accept; `fudic_fix` leaves it.\n- Which piece styles which element is read from its selectors: a rule whose subject is the\n  element's type (`:where(button)`). A piece styled by class or attribute (`popover`) is adopted\n  by hand.\n- Every colour is `light-dark(light, dark)`, and the page follows the system. A zone forces a\n  mode with `color-scheme: dark`, and the components inside it follow.\n- Edit the guide where it is: change a token in `tokens.css`, a piece in its file. Restyling one\n  zone or one component of the app is setting a token on it, in a sheet the layout links:\n  `.promo { --guide-accent: #0f7b3f; }`.\n",
 "diagnostics": [],
 "next": null
}
```

*(Glob)*

*(Read src\guide\button.css)*

**Modelo:** El `button.css` de la guía ya da el aspecto primario, el foco y el deshabilitado; mi componente solo añade las variantes, el alto táctil y el indicador. Escribo la vista.

*(Write src\components\tienda-button\tienda-button.fud)*

**Llamada:** `fudic_check` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "errors": 0,
  "warnings": 0,
  "fixable": 0,
  "files": 0
 },
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_test` 

```json
{
 "paths": [
  "src/components/tienda-button"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 6,
  "fail": 2,
  "broken": 0,
  "skipped": 0
 },
 "tests": [
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via ssr > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:30",
   "quote": "expect(shadowOf(t.host)).toEqual({",
   "message": "expected { mode: 'open', …(5) } to deeply equal { mode: 'open', …(5) }",
   "expected": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}",
   "got": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"button\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}"
  },
  {
   "verdict": "fail",
   "file": "src/components/tienda-button/tienda-button.test.ts",
   "name": "via client > el shadow root entrega el foco al botón de dentro y adopta su hoja",
   "at": "src/components/tienda-button/tienda-button.test.ts:11:30",
   "quote": "expect(shadowOf(t.host)).toEqual({",
   "message": "expected { mode: 'open', …(5) } to deeply equal { mode: 'open', …(5) }",
   "expected": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}",
   "got": "{\n  \"adoptedStyleSheets\": [\n    \"base\",\n    \"button\",\n    \"self\",\n  ],\n  \"clonable\": false,\n  \"delegatesFocus\": true,\n  \"mode\": \"open\",\n  \"referenceTarget\": null,\n  \"serializable\": false,\n}"
  }
 ],
 "ms": 5563,
 "diagnostics": [],
 "next": "Every test of src/components/tienda-button/tienda-button.fud must fail for the right reason: an assertion that says no, not one that breaks. Then run fudic_spec_run."
}
```

**Modelo:** Las 6 que importan pasan. Las 2 que fallan difieren en una sola cosa: `"button"` en las hojas adoptadas. Ejecuto los criterios antes de decidir.

**Llamada:** `fudic_spec_run` 

```json
{
 "spec": "tienda-button"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 9,
  "fail": 0,
  "error": 0
 },
 "browser": "chrome",
 "criteria": [],
 "ms": 7488,
 "diagnostics": [],
 "next": "Make the view of src/components/tienda-button/tienda-button.fud pass these criteria. Do not change the .fudspec."
}
```

**Modelo:** Los **9 criterios pasan en navegador** y 6 de los 8 tests unitarios. Los 2 que fallan son un error mío al escribirlos, no un fallo del botón, así que te lo digo en vez de tocarlos por mi cuenta.

El test afirma que el shadow root adopta `['base', 'self']`. Lo real es `['base', 'button', 'self']`: el componente escribe un `<button>`, y la guía tiene una pieza `src/guide/button.css` que ya define fondo de acento, `:hover`, `:active`, anillo de foco y el estado deshabilitado. Si no la adopto, fudic avisa (`FUD1440`) y yo tendría que duplicar a mano lo que la guía ya dice. Adoptarla es lo correcto; la expectativa del test estaba mal.

```diff
-      adoptedStyleSheets: ['base', 'self'],
+      adoptedStyleSheets: ['base', 'button', 'self'],
```

Nada más cambia: `delegatesFocus: true` ya se cumple (por eso el foco llega al botón), y los otros seis tests pasan tal cual.

Lo que ha quedado en la vista, para que sepas qué vas a ver:

- La variante se refleja en el host (`variant="primary"`), y el CSS solo añade lo que la guía no dice: `secondary` discreta (fondo `surface`, borde `line`, texto `ink`) y `danger` en rojo (`danger` / `on-danger`).
- Alto táctil con `padding-block: var(--tienda-space-3)`, sin números inventados.
- `busy` deshabilita el botón, pone `aria-busy="true"` y mete un indicador `role="progressbar"` que gira, quieto si el sistema pide menos animación.
- Nada de color, radio ni espacio literal: todo son tokens de `tokens.css`.

¿Corrijo esa línea del test? Con tu sí, verde entero y te enseño los cinco casos del fixture con `fudic_look` para la aprobación visual.

## Turno 4

**Persona:** Sí, corrige el test. Y enséñame cómo queda.

*(Edit src\components\tienda-button\tienda-button.test.ts)*

**Llamada:** `fudic_test` 

```json
{
 "paths": [
  "src/components/tienda-button"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 8,
  "fail": 0,
  "broken": 0,
  "skipped": 0
 },
 "tests": [],
 "ms": 5419,
 "diagnostics": [],
 "next": "Every test of src/components/tienda-button/tienda-button.fud must fail for the right reason: an assertion that says no, not one that breaks. Then run fudic_spec_run."
}
```

**Modelo:** 8/8 verde. Ahora los casos del fixture en navegador.

*(ToolSearch)*

**Llamada:** `fudic_look` 

```json
{
 "piece": "src/components/tienda-button/tienda-button.fud"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "piece": "src/components/tienda-button/tienda-button.fud",
 "look": "none",
 "hash": "c25793e15f61",
 "cases": [
  {
   "case": "base",
   "criteria": [
    "dice-su-texto",
    "la-principal-lleva-el-color-de-marca",
    "el-foco-llega-al-boton",
    "se-pulsa-con-el-dedo"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/c25793e15f61/base.png",
   "afterUrl": ".fudic/looks/tienda-button/c25793e15f61/base.png"
  },
  {
   "case": "secundaria",
   "criteria": [
    "la-alternativa-es-discreta"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/c25793e15f61/secundaria.png",
   "afterUrl": ".fudic/looks/tienda-button/c25793e15f61/secundaria.png"
  },
  {
   "case": "peligro",
   "criteria": [
    "la-destructiva-avisa-en-rojo"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/c25793e15f61/peligro.png",
   "afterUrl": ".fudic/looks/tienda-button/c25793e15f61/peligro.png"
  },
  {
   "case": "deshabilitada",
   "criteria": [
    "sin-stock-no-responde"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/c25793e15f61/deshabilitada.png",
   "afterUrl": ".fudic/looks/tienda-button/c25793e15f61/deshabilitada.png"
  },
  {
   "case": "ocupada",
   "criteria": [
    "mientras-trabaja-avisa-y-no-se-repite"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/c25793e15f61/ocupada.png",
   "afterUrl": ".fudic/looks/tienda-button/c25793e15f61/ocupada.png"
  },
  {
   "case": "texto-largo",
   "criteria": [
    "un-texto-largo-se-lee-entero"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/c25793e15f61/texto-largo.png",
   "afterUrl": ".fudic/looks/tienda-button/c25793e15f61/texto-largo.png"
  }
 ],
 "diagnostics": [],
 "next": "Show the user the before and after of tienda-button and ask whether they approve its look. Only if they do, call fudic_record { event: \"look\" }."
}
```

**Modelo:** Seis casos, todos `new`. Los miro yo primero.

*(Read .fudic\looks\tienda-button\c25793e15f61\base.png)*

*(Read .fudic\looks\tienda-button\c25793e15f61\secundaria.png)*

*(Read .fudic\looks\tienda-button\c25793e15f61\peligro.png)*

*(Read .fudic\looks\tienda-button\c25793e15f61\deshabilitada.png)*

*(Read .fudic\looks\tienda-button\c25793e15f61\ocupada.png)*

*(Read .fudic\looks\tienda-button\c25793e15f61\texto-largo.png)*

**Modelo:** Los seis salen bien. Los preparo para que los veas juntos.

*(Skill)*

*(PowerShell)*

*(Bash)*

**Modelo:** Preparo una hoja de aprobación con los seis casos, en la tipografía y los tokens de la propia tienda.

*(Write )*

*(Bash)*

*(Write )*

*(Bash)*

*(PowerShell)*

**Modelo:** Python necesita aprobación; no hace falta — publico los PNG y la fuente como ficheros del artifact.

*(Edit )*

*(Edit )*

*(Edit )*

*(Edit )*

*(Edit )*

*(Edit )*

*(Edit )*

*(Artifact )*

**Modelo:** No publico nada sin tu visto bueno. Las capturas están en tu repo, así que te las describo y te dejo las rutas para abrirlas:

`.fudic/looks/tienda-button/c25793e15f61/`

| caso | cómo queda |
|---|---|
| `base.png` | Azul de acento (`--tienda-accent`), texto blanco, esquinas `radius-md`. «Añadir al carrito». |
| `secundaria.png` | Fondo blanco de superficie, borde gris de línea, texto en tinta. Calla al lado de la principal. |
| `peligro.png` | Rojo `--tienda-danger`, texto blanco. Mismo peso que la principal, otro mensaje. |
| `deshabilitada.png` | El azul al 60 % de opacidad. «Sin stock» sigue leyéndose. |
| `ocupada.png` | Un aro que gira a la izquierda del texto, y el botón apagado. |
| `texto-largo.png` | Crece a lo ancho en una sola línea, sin recortar ni deformarse. |

Todo sale de `tokens.css` y de la pieza `button.css` de la guía; mi CSS solo añade las dos variantes, el alto táctil y el indicador.

**Una cosa que decides tú:** *ocupada* y *deshabilitada* se ven igual de apagadas. Mientras trabaja, el botón se deshabilita de verdad (para que no se pulse dos veces) y la guía pinta al 60 % todo lo deshabilitado. Funciona, pero «estoy trabajando» y «no puedes» no son lo mismo. Puedo dejar *ocupada* a plena opacidad y que avise solo el indicador, sin tocar el comportamiento.

Tenía preparada una hoja con las seis capturas juntas para verlas de un vistazo, pero publicarla sube el contenido a claude.ai y ahí hace falta tu permiso: dime si quieres que la publique y lo hago.

Dos preguntas, entonces: ¿dejo *ocupada* a plena opacidad o se queda como está? Y si el aspecto te vale tal cual, lo registro con `fudic_record` y `<tienda-button>` queda hecho — pasamos a la tarjeta de producto.

## Turno 5

**Persona:** Tienes razón: deja ocupada a plena opacidad, que avise solo el indicador. No publiques nada, enséñamela otra vez aquí y si queda bien la apruebo.

**Modelo:** Cambio: `aria-busy` ya está en el botón, así que lo uso para ganarle al `:disabled` de la guía sin añadir nada al host.

*(Edit src\components\tienda-button\tienda-button.fud)*

**Llamada:** `fudic_check` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "errors": 0,
  "warnings": 0,
  "fixable": 0,
  "files": 0
 },
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_test` 

```json
{
 "paths": [
  "src/components/tienda-button"
 ]
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 8,
  "fail": 0,
  "broken": 0,
  "skipped": 0
 },
 "tests": [],
 "ms": 5392,
 "diagnostics": [],
 "next": "Every test of src/components/tienda-button/tienda-button.fud must fail for the right reason: an assertion that says no, not one that breaks. Then run fudic_spec_run."
}
```

**Llamada:** `fudic_spec_run` 

```json
{
 "spec": "tienda-button"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "summary": {
  "pass": 9,
  "fail": 0,
  "error": 0
 },
 "browser": "chrome",
 "criteria": [],
 "ms": 7460,
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_look` 

```json
{
 "piece": "src/components/tienda-button/tienda-button.fud"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "piece": "src/components/tienda-button/tienda-button.fud",
 "look": "none",
 "hash": "3619dff483fb",
 "cases": [
  {
   "case": "base",
   "criteria": [
    "dice-su-texto",
    "la-principal-lleva-el-color-de-marca",
    "el-foco-llega-al-boton",
    "se-pulsa-con-el-dedo"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/3619dff483fb/base.png",
   "afterUrl": ".fudic/looks/tienda-button/3619dff483fb/base.png"
  },
  {
   "case": "secundaria",
   "criteria": [
    "la-alternativa-es-discreta"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/3619dff483fb/secundaria.png",
   "afterUrl": ".fudic/looks/tienda-button/3619dff483fb/secundaria.png"
  },
  {
   "case": "peligro",
   "criteria": [
    "la-destructiva-avisa-en-rojo"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/3619dff483fb/peligro.png",
   "afterUrl": ".fudic/looks/tienda-button/3619dff483fb/peligro.png"
  },
  {
   "case": "deshabilitada",
   "criteria": [
    "sin-stock-no-responde"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/3619dff483fb/deshabilitada.png",
   "afterUrl": ".fudic/looks/tienda-button/3619dff483fb/deshabilitada.png"
  },
  {
   "case": "ocupada",
   "criteria": [
    "mientras-trabaja-avisa-y-no-se-repite"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/3619dff483fb/ocupada.png",
   "afterUrl": ".fudic/looks/tienda-button/3619dff483fb/ocupada.png"
  },
  {
   "case": "texto-largo",
   "criteria": [
    "un-texto-largo-se-lee-entero"
   ],
   "verdict": "new",
   "after": ".fudic/looks/tienda-button/3619dff483fb/texto-largo.png",
   "afterUrl": ".fudic/looks/tienda-button/3619dff483fb/texto-largo.png"
  }
 ],
 "diagnostics": [],
 "next": "Show the user the before and after of tienda-button and ask whether they approve its look. Only if they do, call fudic_record { event: \"look\" }."
}
```

*(Read .fudic\looks\tienda-button\3619dff483fb\ocupada.png)*

*(Read .fudic\looks\tienda-button\3619dff483fb\deshabilitada.png)*

*(Read .fudic\looks\tienda-button\3619dff483fb\base.png)*

*(Read .fudic\looks\tienda-button\3619dff483fb\secundaria.png)*

*(Read .fudic\looks\tienda-button\3619dff483fb\peligro.png)*

*(Read .fudic\looks\tienda-button\3619dff483fb\texto-largo.png)*

**Modelo:** Hecho y vuelto a pintar. Nada publicado; las capturas nuevas están en `.fudic/looks/tienda-button/3619dff483fb/` (las de antes siguen en `…/c25793e15f61/`, por si quieres comparar).

**Lo que cambió — solo `ocupada`:**

| | antes | ahora |
|---|---|---|
| `ocupada` | azul al 60 %, apagada | **azul pleno, idéntico a `base`**, con el aro girando a la izquierda del texto; cursor `progress` |
| `deshabilitada` | azul al 60 % | igual, sin tocar: azul al 60 %, cursor `not-allowed` |

Ahora los tres estados se distinguen de un vistazo: **activo** (azul pleno), **trabajando** (azul pleno + aro), **no disponible** (apagado). Antes trabajando y no disponible se confundían.

Los otros cuatro casos salen exactamente igual que antes: `base` azul de acento, `secundaria` blanca con borde gris, `peligro` roja, `texto-largo` en una línea sin recortar.

**El comportamiento no se ha tocado:** mientras trabaja el botón sigue deshabilitado de verdad, con `aria-busy="true"`, así que no se puede pulsar dos veces. Una regla de CSS sobre `aria-busy` le gana al `:disabled` de la guía; no hice falta añadir nada al host.

Verificado después del cambio: **8/8 tests**, **9/9 criterios**, **0 diagnósticos**.

¿Apruebas el aspecto? Con tu sí lo registro con `fudic_record { event: "look" }`, cierro `<tienda-button>` como hecho, y empezamos la tarjeta de producto preguntándote qué lleva: imagen, nombre, precio, ¿descuento?, ¿valoración?, ¿stock?, y qué pasa al pulsarla.

## Turno 6

**Persona:** Sí, apruebo cómo se ve. Ciérralo; la tarjeta la dejamos para mañana.

**Llamada:** `fudic_record` 

```json
{
 "piece": "src/components/tienda-button/tienda-button.fud",
 "event": "look"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "piece": "src/components/tienda-button/tienda-button.fud",
 "recorded": [
  "look"
 ],
 "hash": "3619dff483fb",
 "diagnostics": [],
 "next": null
}
```

**Llamada:** `fudic_status` 

```json
{}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "phase": "done",
 "project": {
  "name": "tienda",
  "kind": "app",
  "prefix": "tienda",
  "errorPage": {
   "from": "none"
  }
 },
 "summary": {
  "errors": 0,
  "warnings": 0
 },
 "units": [
  {
   "piece": "src/components/tienda-button/tienda-button.fud",
   "kind": "component",
   "name": "tienda-button",
   "phase": "done",
   "approval": "valid",
   "look": "valid",
   "server": false,
   "tests": "pass 8/8",
   "spec": "pass 9/9",
   "documented": "4/4",
   "functions": {
    "connected": 0,
    "missing": 0
   }
  },
  {
   "piece": "src/routes/index.fud",
   "kind": "route",
   "name": "/",
   "phase": "criteria",
   "approval": "none",
   "server": false,
   "tests": "not run",
   "spec": "not run",
   "documented": "0/0",
   "functions": {
    "connected": 0,
    "missing": 0
   }
  }
 ],
 "diagnostics": [],
 "next": "src/components/tienda-button/tienda-button.fud is finished: call fudic_record { piece: \"src/components/tienda-button/tienda-button.fud\", event: \"done\" }."
}
```

**Llamada:** `fudic_record` 

```json
{
 "piece": "src/components/tienda-button/tienda-button.fud",
 "event": "done"
}
```

**Respuesta:**

```json
{
 "fudicVersion": "0.0.1",
 "commit": "2f3a378",
 "piece": "src/components/tienda-button/tienda-button.fud",
 "recorded": [
  "documented",
  "done"
 ],
 "diagnostics": [],
 "next": null
}
```

**Modelo:** Cerrado. Guardo el plan para retomarlo mañana.

*(Read )*

*(Write )*

*(Write )*

**Modelo:** `<tienda-button>` queda **hecho**: aprobación de props y criterios válida, aspecto aprobado, 8/8 tests, 9/9 criterios, 4/4 props documentados, 0 diagnósticos en todo el proyecto.

Lo que hay en `src/components/tienda-button/`:

- **`.fud`** — props `variant` (`primary` · `secondary` · `danger`), `type`, `disabled`, `busy`. Adopta `button.css` de la guía y solo añade las dos variantes, el alto táctil con `--tienda-space-3` y el indicador. Ni un color, radio o espacio literal.
- **`.fudspec`** — nueve criterios en tus palabras, corriendo en Chrome.
- **`.test.ts`** — ocho tests de lo que no se ve: el `type` del botón interno, el clic que no escapa cuando está deshabilitado, `aria-busy`, y el shadow root por SSR y por cliente.
- **`.fudlog`** — las dos aprobaciones, la del aspecto y el `done`.

Nada está confirmado en git todavía: `src/components/` sigue sin seguimiento. Dime si quieres que lo confirme.

Mañana, la tarjeta de producto. Empezaré preguntándote qué lleva —imagen, nombre, precio, descuento, valoración, stock— y qué pasa al pulsarla, antes de escribir una línea. He dejado nota del encargo para retomarlo sin repetir la conversación.
