# @shop/admin

A [fudic](https://github.com/fudiePlatform/fudic) app: pages and components written as `.fud`
files, served as HTML with Declarative Shadow DOM.

```sh
pnpm --filter admin dev        # serve it while you work on it
pnpm --filter admin build      # build it into dist/
pnpm --filter admin preview    # serve the build
pnpm --filter admin test       # unit tests, src/**/*.test.ts
pnpm --filter admin spec       # .fudspec criteria, in a browser
```

## What is here

- `src/routes/index.fud`: the page at `/`, and `index.test.ts` its unit test.
- `src/layouts/_layout.fud`: the frame every page is written into, and `_layout.test.ts` its unit test.
- The style guide is the workspace's `libs/guide`: every page links it; a component adopts its pieces by name, `shadowrootadoptedstylesheets="button"`.
- `fudic.json`: its id, and the tag prefix of its components (`admin-`).
- `sw.json`: what the Service Worker caches; delete it for no Service Worker.
- `page.headers`, `sw.headers` and `assets.headers`: the headers of its pages (the CSP among them), of its Service Worker and of its static files. What is in them is what is sent.
- `vite.config.ts`: the dev server and the build. `vitest.config.ts`: the unit tests.

Components go to `src/components/`, one folder each, when you generate them.

## Never change the `id` in `fudic.json`

The Service Worker names its caches after it. Change it, and the caches of the old one stay in
the browser of everyone who visited the app, and nothing ever deletes them.

## Add to it

```sh
fudic g component card --in src/routes/index.fud   # <admin-card>, linked from the home page
fudic g page blog
fudic g layout admin --sections aside
```
