# `@fudic/workbench`

A component's acceptance criteria, run in a real browser: green or red on every save, in the
editor, and from the command line.

```
app-tabs.fud
app-tabs.fudspec          the criteria
app-tabs.fixture.ts       the props each criterion mounts with (`props <name>`)
fudic/terms/{given,when,then}/<term>.js
```

Add it as a devDependency of the app. It runs the criteria in the system Chrome, or Edge, or the
Chromium Playwright downloads (`npx playwright-core install chromium`), in that order.

## In the editor

**Ctrl+K V** (`Cmd+K V`) on a `.fud` or its `.fudspec`. Each criterion is a card with its steps,
its verdict and what the measuring browser saw: a shot at the end (and one before the first
`when`), with a box on every element a step located. The ones that fail come first, with what was
expected against what it got. **Live** opens the criterion's page, alive, to touch it.

Saving the `.fud`, a component it links, the `.fudspec`, the fixture or a term runs it again.

| | |
|---|---|
| `r` · Run all | every criterion |
| `f` · Run failing | the ones that did not pass |
| `p` · Pause | saving does not run; resuming runs once if something was saved |
| `Esc` · Cancel | stops the running criteria |
| Pin | saving runs only the pinned criterion |
| `j` `k` `Enter` `l` | move between cards, fold, open Live |

The `.fudspec` shows a mark in the margin of each criterion, the failing ones in Problems, and a
«▶ Run» above each. The status bar says `app-tabs 2/3`. The tab's «Open in browser» shows the same
page in your browser.

One process serves every component of a project: opening the second one starts nothing.

Settings: `fudic.workbench.browser` (`auto`), `fudic.workbench.workers` (`4`),
`fudic.workbench.node` (the Node that runs it).

## From the command line

```sh
fudic-workbench run [<path>…] [--browser <b>] [--workers <n>] [--json]
```

Runs every `.fudspec` under the current folder (or in the files and folders given) and exits with
`0` only when every criterion passed. A good `test:spec` script, and a CI step:

```
app-card
  ✓ altura-minima                  252 ms
  ✗ titulo-largo-visible           268 ms
      then app-card says "A tilte long enough"
        expected  A tilte long enough
        actual    A title long enough that it has to wrap onto a second line inside the card
3 criteria · 2 pass · 1 fail · 0 error · 2.4 s · chrome
```

`--json` prints one JSON message per line instead, and a last `summary` line. Nothing to run is
an error, so a CI that lost its specs does not pass.

`<b>` is `auto`, `chrome`, `msedge`, `chromium`, `firefox` or `webkit`. Firefox and WebKit are
Playwright's builds: `npx playwright-core install firefox`.

## The workbench process

```
fudic-workbench <file> [--port <n>] [--keep] [--browser <b>] [--workers <n>]
```

Its first line on stdout is `{"url","tag","component","criteria","browser"}`, or `{"error":…}`
and exit 1. After it, every message its shells receive, one JSON line each. On stdin it takes one
JSON command per line:

```json
{"v":2,"type":"open","file":"/…/app-card.fud"}
{"v":2,"type":"close","tag":"app-card"}
{"v":2,"type":"run","tag":"app-card","ids":["altura-minima"]}
{"v":2,"type":"run","tag":"app-card","failing":true}
{"v":2,"type":"pin","tag":"app-card","id":"altura-minima"}
{"v":2,"type":"pause","tag":"app-card","paused":true}
{"v":2,"type":"cancel","tag":"app-card"}
```

It stays up until stdin closes or `SIGINT`, and then closes the browser and Vite and deletes its
pages (`node_modules/.fudic-bench/<pid>/`; `--keep` leaves them). A folder left by a process that
died is swept by the next one.

From code: `openWorkbench(file, options)` and `runSpecs(paths, options)`.

## How it runs

One server on `127.0.0.1`: each component's shell at `/__bench/<tag>/`, its WebSocket, and the
project's Vite with the fudic plugin behind them. The project's `vite.config` is not loaded; its
`fudic.json` is. Type errors are the editor's and the build's: the workbench does not check types.

Each criterion gets a generated page that mounts the component alone, with nothing of the
workbench in it. A `Signal` prop in the fixture is owned by a small host component the workbench
writes, seeded with the fixture's initial value (it must be a JSON value). The component is
mounted without the app's layout, so a sheet the layout links does not reach it.

Criteria run in parallel, each in its own page; a page has 30 s to load.

## The terms' `ctx`

A term module is `run(ctx, args)` → `{ pass, evidence }`, with `args` by the names in
`meta.params` (a `number` parameter arrives as a number). An evidence `{ expected, actual }` is
shown one against the other.

- `ctx.locate(ref)` takes a tag (`app-card`) or a role (`role:tab`, `role:tab/"Tab B"`, the name
  matched exactly). A reference that matches more than one element fails the step, saying how
  many. The locator has `box()`, `textContent()`, `isVisible()`, `click()` and
  `setAttribute(name, value)`; every call gives up after 5 s.
- `textContent()` is the text a person sees: it goes into shadow roots, puts each slot's assigned
  content (or its fallback) in place, and leaves out `<style>`, `<script>` and `<template>`.
- `ctx.goto(path)` does not navigate — the component is mounted on its own page — and the step
  is shown as not applying.

## The first click

A component that is not hydrated yet receives its first gesture through the hydration capturer,
which holds it, loads the component and replays it a few milliseconds later. So `click()` and
`setAttribute()` return only once the page has served the gesture: when the nearest hydratable
host was not defined before acting, they wait for its `fud:hydrated`, and then one animation
frame. A `then` after a `when` reads the state the gesture produced.

## Verdicts

- **error** — a step threw (a missing term, an ambiguous reference, a timeout), the page did not
  load, or the page logged an uncaught error. The first error stops the criterion.
- **fail** — a `then` answered `pass: false`. A red `then` does not stop the others.
- **pass** — otherwise.

A `.fudspec` with errors runs nothing: the shell shows its diagnostics instead.
