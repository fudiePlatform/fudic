# `@fudic/workbench`

One component, its acceptance criteria run in a real browser, green or red on every save.

Open a component (or its `.fudspec`) and the workbench mounts it alive — with the props of its
fixture, hydrated, touchable — on one card per criterion. Each criterion runs in the system
Chrome, without a window, and its card turns green or red with the evidence of every step.
Saving the `.fud`, the `.fudspec`, the fixture or a term runs them all again.

In VS Code it is **Ctrl+K V** (`Cmd+K V` on a Mac). The tab has an «Open in browser» button that
shows the same page in Chrome.

```
app-tabs.fud
app-tabs.fudspec          the criteria
app-tabs.fixture.ts       the props each criterion mounts with (`props <name>`)
fudic/terms/{given,when,then}/<term>.js
```

Add it as a devDependency of the app; it needs Google Chrome installed (no browser is
downloaded).

## The binary

```
fudic-workbench <file> [--port <n>] [--keep]
```

`<file>` is the component's `.fud` or its `.fudspec`. While it lives it prints one JSON line:

```json
{"url":"http://127.0.0.1:53411/__bench/","tag":"app-tabs","component":"/…/app-tabs.fud","criteria":2}
```

or `{"error":{"code":"FUD0970","message":"…"}}` and exits with 1. It stays up until its stdin
closes or it gets `SIGINT`, and then closes Chrome and Vite and deletes its generated pages
(`node_modules/.fudic-bench/<tag>/`; `--keep` leaves them, for debugging). `--port` fixes the port;
by default it is ephemeral.

The same from code: `openWorkbench(file, { port, keep })` answers `{ url, tag, component, criteria,
close() }`, or `{ diagnostic }`.

## How it runs

One server on `127.0.0.1`: the shell at `/__bench/`, its WebSocket, and the project's Vite with the
fudic plugin behind them. The project's `vite.config` is not loaded; its `fudic.json` is.

Each criterion gets a generated page that mounts the component alone, with nothing of the
workbench in it. A `Signal` prop in the fixture is owned by a small host component the workbench
writes, seeded with the fixture's initial value (it must be a JSON value). What you see in the
cards and what Chrome measures are two instances of the same page: touching yours does not
disturb the measure.

The component is mounted without the app's layout, so a sheet the layout links (design tokens,
for instance) does not reach it.

## The terms' `ctx`

A term module is `run(ctx, args)` → `{ pass, evidence }`, with `args` by the names in
`meta.params` (a `number` parameter arrives as a number). The `ctx`:

- `ctx.locate(ref)` takes a tag (`app-card`) or a role (`role:tab`, `role:tab/"Tab B"`, the name
  matched exactly). A reference that matches more than one element fails the step, saying how
  many. The locator has `box()`, `textContent()`, `isVisible()`, `click()` and
  `setAttribute(name, value)`; every call gives up after 5 s.
- `textContent()` is the text a person sees: it goes into shadow roots, puts each slot's assigned
  content (or its fallback) in place, and leaves out `<style>`, `<script>` and `<template>`.
- `ctx.goto(path)` does not navigate — the component is mounted on its own page — and the step's
  evidence says it was ignored.

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
