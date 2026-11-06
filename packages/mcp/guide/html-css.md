# html-css

The HTML fudic accepts, the one `<style>` of a component and how it is scoped, styles shared by
every component, and design tokens.

## A strict HTML subset

fudic parses a strict subset of HTML. It does **no HTML5 error recovery**: nothing is closed,
inserted or dropped for you; each mistake is a diagnostic.

| Rule | Code when broken |
|---|---|
| Close every element explicitly: `<li>One</li>`, `<p>…</p>` | `FUD0052` |
| No close tag without its open tag | `FUD0051` |
| Void elements take no close tag: `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr` | `FUD0053` |
| Self-closing is allowed on any element: `<div/>` is `<div></div>` | — |
| Quote every attribute value: `class="card"` | `FUD0056` |
| Close every quoted value | `FUD0015` |
| One attribute of each name per element (case-sensitive) | `FUD0190` |
| Character references: only `&lt;` `&gt;` `&amp;` `&quot;` `&apos;` and numeric ones (`&#160;`, `&#x2014;`). Type any other character as itself: `é`, `…`, `—` | `FUD0057` |
| A literal `<` in text is `&lt;`. A lone `&` (`Fish & Chips`) is fine | `FUD0013` |
| `@` always starts a fudic construct. A literal at sign is `@@` | `FUD0010` |
| `<![CDATA[ … ]]>` only inside `<svg>` or `<math>` | `FUD0054` |

Two values may go without quotes, and only these two:

- a value that is **one** `@` expression: `href=@url`, `@click=@save`, `class:on=@active`;
- the value of a `.prop` that is a scalar literal: `.count=3`, `.open=true`, `.note=null`.

`id=main` is `FUD0056`. `.name=Hello` is `FUD0056` too: a bare name is not a string.
`<!-- … -->` goes to the output as written; a fudic comment `@* … *@` is never emitted.
`<svg>` and `<math>` switch to their own mode: case-sensitive names, self-closing tags XML-style.

### Unclosed elements

```fud broken=FUD0052 path=src/components/app-steps/app-steps.fud
<app-steps>
  <template shadowrootmode="open">
    <ol>
      <li>Choose a table
      <li>Confirm the booking
    </ol>
  </template>
</app-steps>
```

### Unquoted values

```fud broken=FUD0056 path=src/components/app-note/app-note.fud
<app-note>
  <template shadowrootmode="open">
    <p class=note><slot></slot></p>
  </template>
</app-note>
```

### Named references outside the subset

```fud broken=FUD0057 path=src/components/app-price/app-price.fud
<app-price>
  <template shadowrootmode="open">
    <p>Price&nbsp;list</p>
  </template>
</app-price>
```

Write `&#160;` for a non-breaking space.

## What the markup may not hold

| Written | Instead | Code |
|---|---|---|
| `onclick="…"` or any `on*` attribute | `@click=@save` | `FUD0909` |
| `className`, `htmlFor` | `class`, `for` | `FUD1160` |
| `value={x}` | `.value=@x`, `title="@x"`, `@click=@save` | `FUD1161` |
| `{items.map(…)}` or `{open && …}` in the markup | `@foreach (…) key (…) { … }`, `@if (…) { … }` | `FUD1162` |
| A `<script>` with code in its body | `<script type="module" src="/app.js"></script>` | `FUD0161` |
| `href="javascript:…"`, `srcdoc`, a dynamic `style="…"` | a plain URL, a component, `style:width=@w` | `FUD0915` |
| `.innerHTML=@html` | render it with the template; every value is escaped | `FUD0916` |
| `data-fud-id` and other `data-fud-*` names | your own `data-*` name | `FUD0294` |

A `<script>` whose body is data stays inline: `type="application/ld+json"` and `type="importmap"`.

## The shape of a component

A component `.fud` has a fixed top level, in this order (`FUD0155`):

1. `<link rel="component" href="…">` for each component it uses;
2. one `@code { … }`, if it has one;
3. one `<head>` holding **one** `<style>` (`FUD0159`);
4. the host: one element named with the component's tag (`FUD0156`), whose only child is
   `<template shadowrootmode="open">` (`FUD0157`; `closed` is `FUD0158`).

A file that starts with `<!DOCTYPE html>` is a page or a layout, not a component: a full
document with `<html>`, `<head>` and `<body>` (`FUD0150`, `FUD0151`). See `pages`.

## The component's `<style>`

The `<style>` in the `<head>` of a component is its own stylesheet, adopted into its shadow
root. It is **plain CSS**:

- nesting, `@media`, `@container`, `@supports`, `@layer`, `@keyframes` and the other CSS
  at-rules work as in any stylesheet;
- no fudic construct inside it: any other `@` is `FUD0132`;
- no `@import` (`FUD0855`); braces must balance (`FUD0131`).

What changes with state goes in the markup, never in the CSS: a class that comes and goes is
`class:highlight=@(variant === 'highlight')`, one property is `style:width=@width`. `class:` goes
on an element inside the template, never on the host tag (`FUD0720`).

```fud broken=FUD0132 path=src/components/app-meter/app-meter.fud
<head>
  <style>
    .bar { width: @width; }
  </style>
</head>

<app-meter>
  <template shadowrootmode="open">
    <div class="bar"></div>
  </template>
</app-meter>
```

```fud broken=FUD0159 path=src/components/app-tag/app-tag.fud
<head>
  <style>
    .tag { font-size: 0.75rem; }
  </style>
  <style>
    .tag { color: #444; }
  </style>
</head>

<app-tag>
  <template shadowrootmode="open">
    <span class="tag"><slot></slot></span>
  </template>
</app-tag>
```

## Scoping, `:host`, `::slotted()`, parts

Shadow DOM scopes the stylesheet: a selector in a component's `<style>` matches only inside
that component's shadow root. The page's CSS does not reach in, and a component's CSS does not
leak out. Inherited properties (`color`, `font`) and custom properties do cross the boundary.

- **`:host`** is the component's own tag. A custom element is `display: inline` unless you say
  otherwise: give it `display: block` or `inline-block`.
- **`::slotted(selector)`** styles the top-level elements the user put into a slot. They live
  in the page, not in the shadow root.
- **`part="name"`** on an element of the template exposes it. Whoever uses the component styles
  it from outside with `app-card::part(title) { … }`. `fudic_describe` lists a component's parts.

```fud path=src/components/app-card/app-card.fud
@code {
  /** A card with a title. Whatever is written inside the tag fills it, under the title. */
  const { title } = props<{
    /** The heading of the card: one short line. */
    title: string;
  }>();
}

<head>
  <style>
    :host {
      display: block;
    }
    .card {
      border: 1px solid var(--app-color-line);
      border-left: 3px solid var(--app-color-accent);
      border-radius: var(--app-radius);
      padding: var(--app-pad);
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
      <h2 part="title">@title</h2>
      <slot></slot>
    </article>
  </template>
</app-card>
```

```fud path=src/components/app-label/app-label.fud
<head>
  <style>
    ::slotted(label) { font-weight: 500; }
  </style>
</head>

<app-label>
  <template shadowrootmode="open">
    <slot></slot>
  </template>
</app-label>
```

## Styles shared by every component

A stylesheet listed in `fudic.json` is adopted into the shadow roots of the project's
components. Create one with `fudic_generate { kind: "style", name: "theme" }`: it writes
`theme.css` at the project root and lists it under `globalStyles`.

```json path=fudic.json
{
  "id": "app",
  "kind": "app",
  "prefix": "app",
  "server": "src/server",
  "browser": "src/browser",
  "globalStyles": {
    "theme": "theme.css"
  }
}
```

- **`globalStyles`**: adopted by **every** component of the project.
- **`styles`**: adopted only by a component that names it in its template:
  `<template shadowrootmode="open" shadowrootadoptedstylesheets="panel">`, with
  `"styles": { "panel": "src/styles/panel.css" }` in `fudic.json`. A name that is not declared
  there is `FUD0744`; the names are plain text, never an `@` expression (`FUD0745`).

The order is the cascade: the global styles of the libraries the project uses (in dependency
order), then the project's `globalStyles`, then the `styles` the component names, then the
component's own `<style>`. The guide defines, the component adjusts.

These sheets live inside shadow roots, so:

- write `:host`, never `body`, `html` or `:root` (`FUD0743`);
- no `@import` (`FUD0854`): list each file in `fudic.json` instead;
- with no component yet, `FUD0742` warns that nothing adopts them.

**An app's sheets reach only the components that app defines.** A library's component looks the
same in every app; an app can change only the custom properties it reads.

The light DOM of a page (the markup of routes and layouts, outside every component) is styled
by a stylesheet the layout links in its `<head>`: `<link rel="stylesheet" href="../styles/main.css">`.

## Design tokens

A token is a custom property declared directly in a `:host` or `:root` rule (also inside
`@layer`) of a sheet listed in `globalStyles` or `styles`, of the project or of a library it
uses. A custom property declared in any other rule is local to that rule, not a token.

Document each token the way a prop is documented: a `/** … */` right above its declaration.
Name it `--<prefix>-<group>-<name>`: the second segment is its group (`color`, `space`).

```css path=theme.css
/* Adopted inside every component of app: write :host, not body. */
:host {
  /** Body text. Use it for anything read, never for a border. */
  --app-color-ink: #1c1c1e;
  /** Hairlines and borders that separate, without drawing attention. */
  --app-color-line: #dcdcdc;
  /** The one colour that marks what matters: a link, an active item, a card's edge. */
  --app-color-accent: #0b5fff;
  /** Corner radius of a surface. Smaller elements inside it use none. */
  --app-radius: 10px;
  /** Padding inside a surface, block then inline. */
  --app-pad: 1rem 1.15rem;
}
```

- **Before writing any style, call `fudic_symbols { kind: "tokens" }`** and use only those
  names. Each entry has its `value`, `group`, `doc` and where it comes from. `fudic_describe`
  takes one token name.
- No literal colour, radius or spacing when a token says it; ask the user before adding one.

## Tokens from a library

In a workspace, the design tokens usually live in a **style library**: one `tokens.css` and
nothing else. `fudic_generate { kind: "lib", name: "tokens", stylesOnly: true }` creates it:

```json path=libs/tokens/fudic.json
{
  "kind": "lib",
  "globalStyles": { "tokens": "tokens.css" }
}
```

```css path=libs/tokens/tokens.css
/* Custom properties the components of whoever uses tokens can read: var(--tokens-ink). */
:host {
  /** Body text. Use it for anything read, never for a border. */
  --tokens-ink: #1c1c1e;
}
```

A project adopts them by depending on the library: `fudic_add { module: "tokens", project: "ui" }`
for a component library, `fudic_add { module: "tokens", project: "web" }` for an app. From then
on every component of that project adopts `tokens.css` first, before its own sheets, and
`fudic_symbols { kind: "tokens" }` lists the library's tokens before the project's. A component
library that uses the tokens passes them on: an app that uses it gets the whole chain.
