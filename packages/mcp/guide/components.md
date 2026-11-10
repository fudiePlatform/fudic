# components

How to write a `.fud` component: the file, its props and state, using other components, events, calling the server, and the React habits that do not apply.

## Create it, never write it from scratch

Call `fudic_generate { kind: "component", name: "card" }`. The project prefix turns the name into the tag (`app-card`; a name with a hyphen is kept whole) and writes four files in `src/components/app-card/`: `app-card.fud`, `app-card.test.ts`, `app-card.fudspec` and `app-card.fixture.ts`. They pass as generated. The `.fud` starts as an empty `<style>` and the tag around an empty template; you fill it in. When you add a required prop, give it a value in `base` of the `.fixture.ts` (`base: { title: "Card" }`), or the fixture stops type-checking.

## The shape of the file, in this order

1. `<link rel="component" href="…">` for each component it uses, and `<link rel="server" href="./app-card.fudapi">` if it calls the server.
2. One `@code { }` block (a second one is `FUD0154`). TypeScript.
3. `<head><style>…</style></head>`: one `<style>` (`FUD0159`), scoped to the component. Optional.
4. The component's own tag wrapping exactly one `<template shadowrootmode="open">` (`FUD0156`, `FUD0157`). Everything it renders goes inside the template.
5. `@snippet name(args) { … }` declarations, if any: reusable markup of this file, called with `@render name(…)`.

Out of order is `FUD0155`. A component may have no `@code` and no `<head>`.

```fud path=src/components/app-card/app-card.fud
@code {
  /**
   * A card with a heading. What is written between its tags fills the body; an element with
   * slot="meta" goes beside the heading. The body folds with a button.
   */
  const { title, variant = "default" } = props<{
    /** The heading of the card: one short line. */
    title: string;
    /** "highlight" draws the card with a strong border. */
    variant?: "default" | "highlight";
  }>();

  import { signal } from "@fudic/core";

  const open = signal(true);

  function toggle() {
    open.set(!open());
  }
}

<head>
  <style>
    :host { display: block; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
    .card.highlight { border-color: #1a73e8; }
    ::slotted([slot="meta"]) { font-size: 0.8rem; }
  </style>
</head>

<app-card>
  <template shadowrootmode="open">
    <article class="card" class:highlight=@(variant === "highlight")>
      <header>
        @render heading(@title)
        <slot name="meta"></slot>
      </header>
      @if (open()) {
        <div class="body"><slot></slot></div>
      }
      <button type="button" @click=@toggle>
        @if (open()) { Fold } else { Unfold }
      </button>
    </article>
  </template>
</app-card>

@snippet heading(text: string) {
  <h2>@text</h2>
}
```

Styles: `:host` is the component's own tag, `:host(:empty)` and the like work, `::slotted(sel)` styles what the page put in a slot. A `class:` on the component's own tag is `FUD0720`: put it on an element inside the template. Tokens and the CSS fudic accepts: topic `html-css`. Expressions, `@if`, `@foreach`, `@render`: topic `view`. Tests and criteria: topic `testing`; after every write, `fudic_check`.

## Props

- **One `props<T>()` call**, destructured: `const { title, variant = "default" } = props<{ … }>()`. The view reads the destructured names (`@title`), never `props.x`.
- **Required** = a key without `?`. Not passing it is a TypeScript error on the tag. An unknown prop is `TS2561`.
- **Optional** = `?`. Its **default** goes in the destructuring, and only optional props take one. A value prop follows the parent: `.count=@n()` with a signal `n` repaints the child when `n` changes.
- **JSDoc**: the first `/** … */` of the `@code` documents the component; a `/** … */` on each key of `T` documents the prop. `fudic_describe` and the editor show them, and `fudic_status` counts what is documented.
- **Rest**: `const { label, ...rest } = props<{ label: string; placeholder?: string; required?: boolean }>()` gathers the keys not named; `<input ...rest>` writes them as attributes. `T` must be a literal or a type declared in the same `@code`.
- **A signal prop**: `value: Signal<number>` (type from `@fudic/core`) receives the parent's signal itself, so the child can read, derive and write it. The parent passes the bare name: `.value=@count` (anything else is `FUD0200`).
- **A callback prop**: `onPick: (option: string) => void`. The parent passes the bare name of a function of its `@code` (`.onPick=@chosen`, else `FUD0201`), and the child must call it from a handler (`FUD0202` otherwise). This is the way back to one parent.

## State and what `@code` may do

`@code` is browser code. There is no `@server` / `@client` region (`FUD1110`): the server evaluates only what the view reads.

- `signal(v)`: read `n()`, write `n.set(v)`. `computed(() => expr)`: derived and read-only.
- `effect(fn)` reruns when anything it read changes. `effect(fn, [a, () => user().id])` reruns only when one of those sources changes, and nothing else the body reads counts; `[]` runs once. Pass sources, not values: `[count()]` is a type error. A returned function is the cleanup, run before the next run and on removal.
- Effects and tasks created while `@code` runs are torn down with the component (the compiler wraps the block in `owned`; never call it yourself). One created inside a handler lives as long as the page.
- What the view reads must be something the server can evaluate: props, `signal(v)`, `computed(() => e)` whose `e` follows the view rules, a `const` of plain data. Anything else it reads is `FUD1150`. The view calls nothing but reactive reads (`FUD1140`).
- `now()` only as the whole initializer of a signal: `signal(now())` (`FUD0912`).
- Handlers and effect bodies are plain TypeScript: DOM APIs, `await`, anything. Names starting with `$` are reserved (`FUD0290`).

## Using another component

Link it, then write its tag. A tag with no link is `FUD0191`; a link never used is `FUD0721`. Before using one, call `fudic_describe { name: "app-card" }` for its props, slots and events instead of opening its file.

```fud path=src/components/app-badge/app-badge.fud
@code {
  /** A small rounded label. Its text is what is written between the tags. */
  const { tone = "neutral" } = props<{
    /** The colour: "neutral" grey or "success" green. */
    tone?: "neutral" | "success";
  }>();
}

<head>
  <style>
    .badge { padding: 0.15rem 0.5rem; border-radius: 999px; background: #f3f3f3; }
    .badge.success { background: #e6f4ea; }
  </style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span class="badge" class:success=@(tone === "success")><slot></slot></span>
  </template>
</app-badge>
```

```fud path=src/components/app-feed/app-feed.fud
<link rel="component" href="../app-card/app-card.fud">
<link rel="component" href="../app-badge/app-badge.fud">

@code {
  /** The list of posts, one card each, the featured ones highlighted. */
  type Post = { id: string; title: string; tag: string; summary: string; featured: boolean };

  const { posts = [] } = props<{
    /** The posts to show, in order. */
    posts?: readonly Post[];
  }>();
}

<app-feed>
  <template shadowrootmode="open">
    @foreach (const post of posts) key (post.id) {
      <app-card ...post .variant=@(post.featured ? "highlight" : "default")>
        <app-badge slot="meta" .tone=@(post.featured ? "success" : "neutral")>@post.tag</app-badge>
        @post.summary
      </app-card>
    } @empty {
      <p>No posts yet.</p>
    }
  </template>
</app-feed>
```

- **`.prop=` passes a prop**: `.title="Hello"` (a string), `.count=3`, `.open=true`, `.title=@post.title`, `.variant=@(expr)`. It is the only way to pass a prop.
- **A plain attribute is HTML** on the host: `id`, `class`, `role`, `data-*`, `aria-*`. `tone="info"` on a component is a TypeScript error, not a prop.
- **`class:name=@cond`** toggles a class of this file's `<style>` on the child's tag or any element.
- **`@event=@handler`** listens on that element (see Events).
- **Slots**: the child declares `<slot></slot>` (default) and `<slot name="meta"></slot>`; the parent writes content between the tags, and `slot="meta"` on an element sends it to the named one. A `<slot>` may hold fallback content.
- **Spread**: `...post` passes one prop per key the child declares, read from `post`; extra keys are ignored, a missing optional key takes its default. A `.prop` on the same tag wins its key. Only a name or a path follows the dots (`FUD0991`); not on the component's own tag or template (`FUD0992`).
- **`control=@form.field`** on a form-associated component reaches its `ctrl` prop (see Forms).

## Events

A handler, on any element, is a reference (`@click=@save`: `save` gets the DOM event), a call (`@click=@remove(item.id)`, `@keydown=@onKey($event, item.id)`: the arguments you write, `$event` being the event) or a lambda (`@click=@(() => count.set(0))`). Anything else is `FUD0291`; `onclick="…"` is `FUD0909`.

`ref="@field"` assigns the element to a variable you declare, `let field: HTMLInputElement | null = null;`: `null` until rendered and while an `@if` hides it. One identifier (`FUD0094`), never inside a loop (`FUD0192`). Use it from handlers and effects (see `app-search` below).

**`emit(name, detail)`** from `@fudic/dom` announces an event from the component; it bubbles out of the shadow root to the page. **`bus:name=@handler`** on any element of any component receives it, with the detail as the argument, typed by the receiver's parameter: `emit("picked", 5)` where a receiver takes a `string` is underlined at the `emit`. Every receiver on the page hears it; for one parent, use a callback prop.

**Events inside a loop: delegate.** An `@event` inside `@foreach` adds one listener per row (`FUD1380`, a warning). Put the handler on an element outside the loop, pass it the row by its loop name, and mark the element in the row with `delegate:name="click"` (the events it serves, space-separated; no value serves them all). The row arrives typed, also inside an argument (`@remove(p.id, p.name)`). `$p` is `FUD1383`; a marker no handler reads for that event is `FUD1381`; outside a loop, `FUD0663`.

**`$value`: the value of the control, typed.** Like `$event`, it exists only in the arguments of a handler's call, and it is the value of the control the event came from: `<input type="checkbox" @change=@activate($value)>` hands `activate` a `boolean`, `<input type="search" @input=@search($value)>` a `string`. A `number` gives `number | null` (empty is `null`), a `range` `number`, a `file` `File | null` (with `multiple`, `readonly File[]`), a `<select multiple>` `string[]`, any other field `string`. Delegated, it reads the element marked `delegate:<row>` that serves the handler, never the `target`: `<tbody @change=@activate(p, $value)>` with the box marked `delegate:p="change"`. On an element with no value (`<div>`, `<button>`, a component tag), in `bus:` or in `@fudic:*` it is `FUD1462`; with `type=@expr`, `FUD1463`; marks of different types for one handler, `FUD1464`.

**Two buttons with the same event in a row: name the handlers.** `<tbody @click.remove=@remove(p) @click.view=@view(p)>` and, in the row, `<button delegate:p="click.remove">` and `<button delegate:p="click.view">`. The event is what comes before the `.`, the name what comes after (`[a-z][a-z0-9-]*`, else `FUD1465`). A named handler only exists delegated (`FUD1466` if it reads no row), a mark with a name is read only by the handler of that name, and a mark without one never by a named handler: the `click` of *View* never reaches *Remove*. One listener per handler on the parent, whatever the rows.

**The events of a form leave the component.** `fudic:result` and `fudic:error` cross the shadow root, so the host of a component hears what its forms announce: `<user-form @fudic:result=@added @fudic:error=@failed>`. The datum is typed by what the component's `form:=@fn` return (`-> Person` gives `added(person: Person)`), adding up what the components it uses announce; on a component with no form the handler is an error. A status the form keeps (`catches`) stays in the form and is not announced.

```fud path=src/components/app-choice/app-choice.fud
@code {
  /** A row of buttons, one per option. Picking one calls `onPick` and announces `picked`. */
  const { options = [], onPick } = props<{
    /** The texts of the buttons, in order. */
    options?: readonly string[];
    /** Called with the option the user picked. */
    onPick: (option: string) => void;
  }>();

  import { emit } from "@fudic/dom";

  function pick(option: string) {
    onPick(option);
    emit("picked", option);
  }
}

<app-choice>
  <template shadowrootmode="open">
    <div @click=@pick(option)>
      @foreach (const option of options) key (option) {
        <button type="button" delegate:option="click">@option</button>
      }
    </div>
  </template>
</app-choice>
```

```fud path=src/components/app-survey/app-survey.fud
<link rel="component" href="../app-choice/app-choice.fud">

@code {
  /** Asks one question and shows the answer. */
  import { signal } from "@fudic/core";

  const options = ["Yes", "No", "Later"];
  const answer = signal("");

  function chosen(option: string) {
    answer.set(option);
  }
}

<app-survey>
  <template shadowrootmode="open">
    <app-choice .options=@options .onPick=@chosen></app-choice>
    <p role="status">@answer()</p>
  </template>
</app-survey>
```

Any other component on the page hears the same `emit` with `<p bus:picked=@heard>Last: @last()</p>` and `function heard(option: string) { last.set(option); }`.

## Calling the server

A component's server functions live in a `.fudapi` beside it: `fudic_generate { kind: "api", name: "src/components/app-search" }` writes it, its handler in `src/server` and the `<link rel="server">`. Declaring functions: topic `fudapi`. In `@code` the functions are in scope by name; wrap them in `task` from `@fudic/core`:

- `task(fn)` calls only on `run(args)`; `task(fn, () => ({ q: text() }), { initial: [] })` calls on every change of what the source reads, never on creation. Pass the function, not a call.
- A GET runs as `latest` (a new call aborts the one in flight); POST, PUT, PATCH, DELETE as `queue` (one after another, in order).
- Read in the view or in code: `value()` (the last answer, or `initial`), `pending()`, `state()` (`"idle"`, `"pending"`, `"done"`, `"failed"`, `"cancelled"`), `error()`, `message()` (the error's message, or `""`). `cancel()` aborts the call in flight.
- `run(args)` never rejects: `const saved = await save.run({ id: p.id, active }); if (saved.ok) { … saved.value … }`. `ok: false` is `status: "failed"` (with `error`) or `"cancelled"`.
- On the server a task never calls: the first data comes from the page (topic `pages`) or a prop.

```fudapi path=src/components/app-search/app-search.fudapi
# The server functions of the component: their handlers are in src/server/components/app-search/app-search.ts.
get search
  q  str
  -> Hit[]

type Hit
  id    i32
  name  str
```

```ts path=src/server/components/app-search/app-search.ts
import { search } from 'fudic:components/app-search/app-search';

search.handle((ctx) => [{ id: 1, name: ctx.args.q }]);
```

```fud path=src/components/app-search/app-search.fud
<link rel="server" href="./app-search.fudapi">

@code {
  /** A search box that lists the matching names as the user types. */
  import { effect, signal, task } from "@fudic/core";

  let field: HTMLInputElement | null = null;
  const text = signal("");
  const found = task(search, () => ({ q: text() }), { initial: [] });

  effect(() => {
    sessionStorage.setItem("app-search", text());
  }, [text]);

  function typed(e: Event) {
    text.set((e.target as HTMLInputElement).value);
  }

  function clear() {
    text.set("");
    field?.focus();
  }
}

<app-search>
  <template shadowrootmode="open">
    <input type="search" aria-label="Name" ref="@field" value=@text() @input=@typed>
    <button type="button" @click=@clear>Clear</button>
    @if (found.pending()) { <span role="status">Searching…</span> }
    @if (found.message() !== "") { <p role="alert">@found.message()</p> }
    <ul>
      @foreach (const hit of found.value()) key (hit.id) {
        <li>@hit.name</li>
      }
    </ul>
  </template>
</app-search>
```

**Files.** A form field `file` binds to `<input type="file" control=@photoForm.photo>`, a `file[]` to one with `multiple` (`FUD1484` / `FUD1485` when they disagree; a file input on a field that is not a file is `FUD1486`). The compiler writes its `accept` from the field's rule. `photoForm.photo.set(file)` puts a file in it from code, as a drop zone does. While `form:=` sends, `photoForm.$progress()` is `{ loaded, total, phase }` (`"up"`, then `"down"`) and `null` otherwise, for a `<progress>`; `photoForm.$cancel()` stops the send. A `task` has the same `progress()`, and `cancel()`. Declaring files, and a component that uploads one: topic `fudapi`.

## Forms: a form-associated control

Forms are declared in a `.fudapi` (`fudic_generate { kind: "form" }`); a component author only needs this. The control imports `@fudic/forms`: a project that has no form yet adds it first with `fudic_add { module: "forms" }`. A component that is a form control marks its template `formassociated`, bridges labels to its inner element with `shadowrootreferencetarget="<id>"` (a static id of that template, `FUD0605`), declares a `ctrl: Control<…>` prop and binds it with `control=@ctrl`:

```fud path=src/components/app-input/app-input.fud
@code {
  /** A text field a form binds with control=. */
  import type { Control } from "@fudic/forms";

  const { ctrl, type } = props<{
    /** The form control the page binds. */
    ctrl: Control<unknown>;
    /** The input type: text, email, number… */
    type?: string;
  }>();
}

<app-input>
  <template shadowrootmode="open" formassociated shadowrootreferencetarget="field">
    <input id="field" type=@type control=@ctrl>
  </template>
</app-input>
```

The page writes its own label and error marker as for a native input: `<label for="email">Email</label>`, `<app-input id="email" .type="email" control=@signup.email></app-input>`, `<small error=@signup.email></small>`. A `<label>` inside a shadow root cannot point outside it.

## Instead of… (React habits)

| Instead of… | Write | Code |
|---|---|---|
| `className="card"` | `class="card"`; a changing one `class:active=@on` | `FUD1160` |
| `htmlFor="email"` | `for="email"` | `FUD1160` |
| `onClick={save}` | `@click=@save` | `FUD0909` + `FUD1161` |
| `value={name}`, `title={x}` | `.value=@name` (property), `title=@x` (attribute) | `FUD1161` |
| `onclick="save()"` | `@click=@save` | `FUD0909` |
| `{open && <p>…</p>}` | `@if (open) { <p>…</p> }` | `FUD1162` |
| `{items.map(i => <li>…</li>)}` | `@foreach (const i of items) key (i.id) { <li>…</li> }` | `FUD1162` |
| `key={i.id}` on the row | `key (i.id)` after the loop header | `FUD0540` when missing |
| `props.title` | `const { title } = props<…>()`, then `@title` | `FUD0907` |
| `children` | `<slot></slot>`, and `<slot name="x">` for more | `FUD0907` |
| `import Card from "./Card"` | `<link rel="component" href="…">`, then `<app-card>` | `FUD0191` |
| `<Card {...item} />` | `<app-card ...item></app-card>` | — |
| `useState(0)`, `setN(n + 1)` | `const n = signal(0)`, `n.set(n() + 1)` | — |
| `useMemo(() => …, [a])` | `computed(() => …)` | — |
| `useEffect(fn, [a])` | `effect(fn, [a])`: sources, not values | — |
| `useRef(null)` | `let el: HTMLElement \| null = null` and `ref="@el"` | — |
| `onChange` prop | a callback prop `.onChange=@fn`, or `emit` + `bus:` | — |
| `fetch` in an effect | a server function in the `.fudapi`, called through `task` | — |
| `@if (name)` truthiness | `@if (name !== "")` | `FUD1151` |
| `.innerHTML=@html` | render the content with the template | `FUD0916` |

```fud broken=FUD1162 path=src/components/app-tags/app-tags.fud
@code {
  const { tags = [] } = props<{ tags?: readonly string[] }>();
}

<app-tags>
  <template shadowrootmode="open">
    <ul>{tags.map(t => <li>{t}</li>)}</ul>
  </template>
</app-tags>
```
