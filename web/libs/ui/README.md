# @web/ui

A [fudic](https://github.com/fudiePlatform/fudic) component library: components your apps use.
It is not served, so it has no pages, no `vite.config.ts` and no `sw.json`.

```sh
pnpm --filter ui test    # unit tests, src/**/*.test.ts
pnpm --filter ui spec    # .fudspec criteria, in a browser
```

## Add a component

```sh
fudic g component card --project ui
```

The `prefix` in `fudic.json` turns `card` into `<ui-card>`. The component gets its own
folder under `src/components/`, with its unit test, its `.fudspec` criteria and their fixture.

## Use it from an app

```sh
fudic add ui --project web
```

An app links a component by the package name:

```html
<link rel="component" href="@web/ui/ui-card.fud">
```

## Share a layout

```sh
fudic g layout main --project ui
```

A page of an app that uses this library renders inside it with:

```html
<link rel="layout" href="@web/ui/layouts/main.fud">
```

The library publishes its `.fud` sources, not a build: the app's build compiles them.

## Share snippets

```sh
fudic g snippet ui productCard --project ui
```

A page or a component of an app that uses this library writes:

```html
<link rel="snippet" href="@web/ui/snippets/ui.fud">
@render productCard()
```
