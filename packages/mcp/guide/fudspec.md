# fudspec

The `.fudspec` language: the acceptance criteria of a component, a page or a flow between pages, written in the user's words, run in a real browser, approved by the user together with the props.

## What it is for

A `.fudspec` holds what a person would check by looking at the component and touching it: what is visible, what it says, what a click or a key does, where the focus goes, what a screen reader is told, how big it is. **One sentence of the user is one criterion** ("a disabled button does nothing", "the second tab shows its panel").

The props (in the `.fud`) and the criteria (in the `.fudspec`, with its fixture) are what the user approves. Propose them in the conversation in plain language, wait for the user's yes, then call `fudic_record { piece: "src/components/app-post/app-post.fud", event: "approved" }`. Never approve on the user's behalf. Changing the `.fudspec` or its fixture afterwards makes the approval expire, and `fudic_status` asks for it again.

What the user does not see (each prop variant, edge values, an event's `detail`, server functions, form rules) goes in unit tests: topic `testing`.

## Create it

`fudic_generate { kind: "component", name: "post" }` already writes `app-post.fudspec` and `app-post.fixture.ts` with one passing criterion. For a component that has none: `fudic_generate { kind: "spec", name: "app-post" }`. Never write the files from scratch.

```
src/components/app-post/app-post.fud
src/components/app-post/app-post.fudspec      the criteria
src/components/app-post/app-post.fixture.ts   the props each criterion mounts it with
fudic/terms/<block>/<name>.js                 terms of your own, at the project root
```

## The shape of a file

```
component <tag>

# A comment explains why the criterion exists.
criterion <slug>
  given
    props <fixture>
  when
    <term> <args>
  then
    <term> <args>
```

- Indentation is structure: 0 spaces for `component` and `criterion`, 2 for `given`/`when`/`then`, 4 for a term. Tabs or other widths are `FUD0921`.
- The first line says what the file is about (`FUD0922` missing, `FUD0923` twice): `component <tag>` (a component of the project, `FUD0949`), `page <route>` (a route, written as on disk: `page /products`, `page /blog/[slug]`, `page /`; `FUD1500` if it does not exist) or `flow <name>` (a path between pages, in `src/flows/<name>.fudspec`). Pages and flows have sections of their own below.
- `criterion <slug>`: a kebab-case name, unique in the file (`FUD0927`). It names the criterion in every report.
- `given` comes first and at most once; then `when` and `then` alternate as many times as the story needs, and the criterion ends in a `then` (`FUD0930` for `given` after another block or two equal blocks in a row, `FUD0933` for an ending that is not a `then`). `given` and `when` are optional. An empty block is `FUD0934`.
- Before every `then` the page is quiet: no request on its way, no `setTimeout` due within a second, no animation frame pending (a `setInterval` does not count). A page that never settles is `FUD1508`, with what was still pending. A positive `then` is tried again until it holds or the time is up (5 s); a negative one (`count … 0`, `hidden`, `unchecked`, `called … 0`, `not-reloaded`) is read once, on the quiet page.
- `#` starts a comment to the end of the line.
- Arguments: a bare token (`app-post`, `16`, `href`), a string in double quotes on one line (`"Tab B"`, `FUD0920` unclosed), or a role reference.
- Several `then` lines are all checked; a red one does not stop the others.

## Targets: tag or role with its name

A term that takes an element accepts:

- a tag: `app-post`, `article`, `time`;
- `role:<role>/"<name>"`: the element with that ARIA role and exactly that accessible name: `role:tab/"Tab B"`, `role:link/"Featured"`, `role:button/"Save"`;
- `role:<role>` alone, when there is only one: `role:tabpanel`;
- `role:<role>/~"<text>"`: the accessible name contains the text: `role:row/~"Ana"`;
- steps joined by `>`, each looked for inside the one before: `role:row/~"Luis">role:button/"Delete"` is the «Delete» of Luis's row, where every row has one. A `>` with no step or a `~` with no text is `FUD1509`.

References go through shadow roots. A reference must match **exactly one** element; more is an error that says how many (`FUD1203`). Prefer roles and names: they are what a person and a screen reader perceive, and a criterion written with them also checks the accessibility. If no role with a name finds the element, the component is probably missing a label: fix the component, not the criterion.

## The fixture: the cases

Each key of the fixture's `export default` is one case: a set of props the component is mounted with. `props <key>` in `given` picks it.

- A component with required props needs `props <key>` in every criterion (`FUD0951`); there is no default case.
- `props` goes in `given`, once (`FUD0952`), and names an existing key (`FUD0950`). The file is `<tag>.fixture.ts` beside the `.fud` (`FUD0953`).
- Type it with `satisfies Fixtures<$Props>`: a missing required prop is a type error.
- `$content` is HTML placed inside the host as its children: how a slot gets filled.
- A `Signal` prop takes its initial value, which must be plain JSON (`FUD0974`).

```fud path=src/components/app-post/app-post.fud
@code {
  /** A post in a list: its title links to it; what is written inside is the summary. */
  const { title, href, variant = "default" } = props<{
    /** The title, one line or two. */
    title: string;
    /** Where the title links to. */
    href: string;
    /** "highlight" draws the card with the brand border. */
    variant?: "default" | "highlight";
  }>();
}

<head>
  <style>
    .card {
      border: 1px solid #dcdcdc;
      border-radius: 10px;
      padding: 1rem 1.15rem;
      background: white;
      h2 {
        margin: 0 0 0.35rem;
        font-size: 1.05rem;
      }
      a {
        color: inherit;
      }
    }
    .card.highlight {
      border-color: #1a73e8;
    }
  </style>
</head>

<app-post>
  <template shadowrootmode="open">
    <article class="card" class:highlight=@(variant === "highlight")>
      <header>
        <h2><a href=@href>@title</a></h2>
        <slot name="meta"></slot>
      </header>
      <div class="body">
        <slot></slot>
      </div>
    </article>
  </template>
</app-post>
```

```ts path=src/components/app-post/app-post.fixture.ts
import type { Fixtures } from '@fudic/terms';
import type { $Props } from './app-post.fud';

// The props each criterion of app-post.fudspec mounts the card with (`props <name>`).
export default {
  base: { title: 'A', href: '/' },
  'long-title': {
    title: 'A title long enough that it has to wrap onto a second line inside the card',
    href: '/blog/long',
  },
  featured: { title: 'Featured', href: '/blog/featured', variant: 'highlight' },
  dated: { title: 'Dated', href: '/blog/dated', $content: '<time slot="meta">May 2026</time>' },
} satisfies Fixtures<$Props>;
```

```fudspec path=src/components/app-post/app-post.fudspec
component app-post

# A card never collapses, whatever its title. It is mounted without the app's layout,
# so 16px is one line of title.
criterion min-height
  given
    props base
  then
    min-height app-post 16

criterion long-title-visible
  given
    props long-title
  then
    visible app-post
    text app-post "A title long enough"

# The link is not clicked: it would navigate away from the card.
criterion title-links-to-post
  given
    props featured
  then
    visible role:link/"Featured"
    attribute role:link/"Featured" href "/blog/featured"

criterion featured-is-highlighted
  given
    props featured
  then
    has-class article highlight

criterion date-beside-title
  given
    props dated
  then
    slotted time meta
    text app-post "May 2026"
```

## The stock terms

They come with `@fudic/terms`; no file to write.

| Block | Term | Passes when / does |
|---|---|---|
| `given` | `props <fixture>` | mounts with that case |
| `when` | `click <target>` | clicks it, and waits until the page served the click |
| `when` | `press <target> "<key>"` | focuses it and presses `x`, `Enter`, `Shift+Tab`… |
| `when` | `type <target> "<text>"` | types into it, key by key |
| `when` | `focus <target>` | focuses it |
| `when` | `set-attribute <target> <attribute> "<value>"` | sets the attribute |
| `then` | `present <target>` | it is in the page, even empty and taking no room |
| `then` | `visible <target>` | it is on screen, with a size |
| `then` | `hidden <target>` | it is not visible |
| `then` | `text <target> "<expected>"` | the text a person sees in it, across shadow roots and slots, contains it |
| `then` | `attribute <target> <attribute> "<expected>"` | the attribute has exactly that value |
| `then` | `focused <target>` | it has the focus, followed into every shadow root |
| `then` | `slotted <target> <slot>` | it went to that slot of its host (`default` is the unnamed one) |
| `then` | `min-height <target> <px>` · `min-width <target> <px>` | it is at least that big |
| `given` | `cookie <name> "<value>"` | the browser has that cookie, for the whole site, before it opens |
| `given` | `locale <tag>` | the page in that language: `Accept-Language` and `navigator.language` |
| `given` | `media <feature> <value>` | `prefers-color-scheme dark`, `prefers-reduced-motion reduce`, `forced-colors active`… |
| `given` | `viewport <width> <height>` | the size of the window |
| `given` | `clock <instant>` | the time, ISO 8601, in the browser and in the criterion's server, standing still until a `wait` |
| `given` · `when` | `offline` · `online` | without network (a page visited before still opens from the Service Worker) |
| `when` | `go <url>` · `back` · `forward` · `reload` | the address bar and the history |
| `when` | `check <target>` · `uncheck <target>` | clicks a checkbox, as a person would |
| `when` | `select <target> "<option>"` · `hover <target>` | picks an option by its text · moves the mouse over it |
| `when` | `upload <target> "<file>"` | chooses that file (relative to the `.fudspec`, `FUD1511` if missing) |
| `when` | `wait <ms>` | moves the clock that long (both clocks with `clock`; real time without) |
| any | `as <who>` | what follows is done by another person: a browser of their own, with their own cookies; `as main` comes back |
| `then` | `title "<expected>"` · `url <path>` | the `<title>` · where the page is, path and query |
| `then` | `status <code>` · `header <name> "<expected>"` | of the last document response (an `_error.fud` answers its code) |
| `then` | `count <target> <n>` | how many elements the reference gives (here more than one is fine) |
| `then` | `value <target> "<expected>"` · `checked` · `unchecked` · `enabled` · `disabled` | the state of a control |
| `then` | `called <fn> <times>` · `sent <fn> <field> "<expected>"` | what the page asked the server in this criterion: how many times, and a field of the last call (`user`, `docs.0`; a file is its name) |
| `then` | `lists "<value>"` | the real `paths()` of the route includes it |
| `then` | `not-reloaded` · `requests <n>` · `downloaded "<name>"` | over the last `when` block: the same document, how many requests went out, a file it downloaded |

An unknown term is `FUD0940` (the message lists the ones the block has); the wrong number of arguments `FUD0947`; an argument of the wrong form `FUD0948`.

```fud path=src/components/app-tabs/app-tabs.fud
@code {
  /** Two tabs; the first is open when the page loads. */
  import { signal } from "@fudic/core";

  const active = signal(0);

  function pickA() {
    active.set(0);
  }

  function pickB() {
    active.set(1);
  }
}

<app-tabs>
  <template shadowrootmode="open">
    <div role="tablist">
      <button role="tab" @click=@pickA>Tab A</button>
      <button role="tab" @click=@pickB>Tab B</button>
    </div>
    <p role="tabpanel">@(active() === 0 ? "panel A" : "panel B")</p>
  </template>
</app-tabs>
```

```fudspec path=src/components/app-tabs/app-tabs.fudspec
component app-tabs

# The first tab is the one open when the page loads.
criterion starts-on-a
  then
    text role:tabpanel "panel A"

# One click on the second tab shows its panel, even on a component not yet hydrated.
criterion switches-tab
  when
    click role:tab/"Tab B"
  then
    text role:tabpanel "panel B"
```

`app-tabs` has no required props, so its criteria need no `given`.

## Where it runs

- Each criterion of a component gets its own page that mounts the component **alone**: no layout, no stylesheet the layout links, no navigation. Do not click a link that leaves the page; do not depend on a token the layout defines. A page or a flow is the app itself (below).
- A component not hydrated yet takes its first gesture anyway: a `when` waits until the page has served it, hydration included, so the `then` after it reads the new state.
- Criteria run in parallel, each with 30 s to load.

## Pages

`page <route>` checks a route with its real layout, opened by its URL in the app with the user's own `vite.config`. **What the fixture names is fake, and everything else is real**: the `layout` always runs; `load` runs unless the criterion says `data`; a function runs unless an `answers` group answers it; `paths()` runs unless the fixture lists `paths`. `fudic_generate { kind: "spec", name: "/shop" }` writes `shop.fudspec` and `shop.fixture.ts` next to the route, the fixture typed with the `Fixtures` its `.fudapi` gives.

```ts path=src/services/items.ts
import { Service } from '@fudic/di';

/** Where the shop keeps its items: a flow puts one of its own in its place. */
export class Items {
  readonly #list: string[];

  constructor(list: readonly string[] = ['Coffee', 'Tea']) {
    this.#list = [...list];
  }

  all(): readonly string[] {
    return this.#list;
  }

  add(name: string): void {
    this.#list.push(name);
  }
}
Service(Items);
```

```fudapi path=src/routes/shop.fudapi
load ssr
  items    str[]
  session  str?

post login
  invalidates /shop
  user  str

post add
  invalidates /shop
  name  str
```

```ts path=src/server/routes/shop.ts
import { inject } from '@fudic/di';
import { setCookie } from '@fudic/http';
import { add, load, login } from 'fudic:routes/shop';
import { Items } from '../../services/items';

load.handle((ctx) => {
  const session = ctx.cookies.get('sid');
  return { items: [...inject(Items).all()], ...(session !== undefined ? { session } : {}) };
});

login.handle((ctx) => setCookie(ctx, 'sid', ctx.args.user));

add.handle((ctx) => inject(Items).add(ctx.args.name));
```

```fud path=src/routes/shop.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./shop.fudapi">

@code {
  async function signIn() {
    await login({ user: "ana" });
  }

  async function addMilk() {
    await add({ name: "Milk" });
  }
}

<head>
  <title>Shop</title>
</head>

<h1>Shop</h1>
<p>Signed in: @(data.session === undefined ? "nobody" : data.session)</p>
<button @click=@signIn>Sign in as Ana</button>
<button @click=@addMilk>Add milk</button>
<ul>
  @foreach (const item of data.items) key (item) {
    <li>@item</li>
  }
</ul>
```

```ts path=src/routes/shop.fixture.ts
import type { Fixtures } from 'fudic:routes/shop';
import { fails } from '@fudic/spec';

export default {
  data: {
    two: { items: ['Coffee', 'Tea'] },
    'two-signed-in': { items: ['Coffee', 'Tea'], session: 'ana' },
    none: { items: [] },
    down: fails(503, 'the database does not answer'),
  },
  calls: {
    'ana-in': { login: undefined },
  },
} satisfies Fixtures;
```

```fudspec path=src/routes/shop.fudspec
page /shop

# The list comes from the fixture: load does not run.
criterion lists-the-items
  given
    data two
  then
    title "Shop"
    count role:listitem 2

# login answers from the fixture, and names the page in `invalidates`: the page asks for its
# data again, and gets the next name of `data`.
criterion signing-in-says-who
  given
    data two two-signed-in
    answers ana-in
  when
    click role:button/"Sign in as Ana"
  then
    sent login user "ana"
    text main "Signed in: ana"

criterion a-failing-load-is-the-error-page
  given
    data down
  then
    status 503
```

The lines of a page's `given` (they are read against the fixture, not terms):

| Line | Does |
|---|---|
| `data <name>+` | what `load` returns: the first name, then the next each time the page asks for its data again (an `invalidates`); the last repeats |
| `answers <name>+` | those groups of `calls` together; the last wins when two answer the same function |
| `services <name>` | the services of that group, put in place of the real ones |
| `path <value>` | opens the route with that value of the fixture's `paths` (`FUD1502` if it is not there) |
| `url <url>` | opens that URL, which has to match the route (`FUD1503`) |

A route with params needs `path` or `url` (`FUD1504`). A name the fixture does not have is `FUD0950`; no fixture file, `FUD0953`; a line for another kind of spec (`props` on a page, `data` on a component), `FUD1501`. `called` and `sent` name functions the page can call (`FUD1506`) and their arguments (`FUD1507`).

The helpers of `@fudic/spec` return data, never promises, so the editor reads the fixture without running it: `fails(status, title)` or `fails('code')` (only the codes the function's `fails` declares), `redirects('/login')`, `later(2000, value)`, `later.never()`, `later.fails(ms, status, title)`, `file('./fixtures/list.csv', { type: 'text/csv' })` for a `-> file` function. A `later` waits on the criterion's clock: with `clock` it arrives at the `wait` that reaches it.

## Flows

`flow <name>` follows a person across pages with **the real server**: login, cookies, redirects and every function run for real. The fixture only says where the data lives (`services`), and each `use` runs once per criterion: what one criterion creates every page of it sees, and no other criterion does, even running at the same time. `fudic_generate { kind: "flow", name: "checkout" }` writes `src/flows/checkout.fudspec` and its fixture.

```ts path=src/flows/checkout.fixture.ts
import type { FlowFixtures } from '@fudic/spec';
import { fails } from '@fudic/spec';
import { Items } from '../services/items';

export default {
  services: {
    empty: [{ provide: Items, use: () => new Items([]) }],
  },
  calls: {
    'no-network': { add: fails(0, 'network') },
  },
} satisfies FlowFixtures;
```

```fudspec path=src/flows/checkout.fudspec
flow checkout

# What one criterion adds, its pages see; the next criterion starts empty again.
criterion what-is-added-is-in-the-list
  given
    services empty
    url /shop
  when
    click role:button/"Add milk"
    go /shop
  then
    count role:listitem 1
    text role:listitem "Milk"

# Luis has a browser of his own: Ana's cookie is not his.
criterion another-person-is-not-signed-in
  given
    services empty
    url /shop
  when
    click role:button/"Sign in as Ana"
    as luis
    go /shop
  then
    text main "Signed in: nobody"
    as main
    text main "Signed in: ana"

criterion without-network-nothing-is-added
  given
    services empty
    answers no-network
    url /shop
  when
    click role:button/"Add milk"
  then
    called add 1
    count role:listitem 0
```

Each criterion starts at its `url`; `go` goes on from there (`FUD1505`, a warning, for a URL no route answers). `fails(0, …)` is a network failure: the call gets no response at all. A criterion with `offline` runs against the app built and served with `vite preview`, the only place the Service Worker paints a page.

A backend that is not fudic's TypeScript server gets the same cookie, `fudic-bench=<criterion>`, on every request of the criterion, and asks the workbench `GET /__bench/criterion/<id>` for `{ services, answers, clock }` by name, to seed itself.

## Recording a fixture

`fudic_spec_run { spec: "/shop", record: true }` runs the criteria of a page or a flow against the real server, with no `data` and no `answers`, and writes what it answered into the fixture under the criterion's name: each `data` the route asked for (`<criterion>`, `<criterion>-2`…), each answer of a function in `calls['<criterion>']`, a received file as `file(…)` with its bytes beside it. The `.fudspec` lines are rewritten to name them, so the criterion runs afterwards with the server stopped. Only a criterion that passes is recorded; a value that cannot be written as a literal is `FUD1515` and left out. Recording again replaces what that name had.

## Terms of your own

When no stock term says it, write one: `fudic_generate { kind: "term", name: "has-class", block: "then", params: ["target:element", "name:token"] }` writes `fudic/terms/then/has-class.js`. Parameter types: `element`, `number`, `string`, `token` (`FUD0962` otherwise). A term of the project replaces a stock term of the same name.

```js path=fudic/terms/then/has-class.js
export const meta = {
  name: 'has-class',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'name', type: 'token' },
  ],
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, name }) {
  const classes = await ctx.locate(String(target)).evaluate((el) => [...el.classList]);
  return {
    pass: classes.includes(String(name)),
    evidence: { expected: `class "${name}"`, actual: `classes "${classes.join(' ')}"` },
  };
}

export const selfTest = [{ args: { target: 'article', name: 'highlight' }, expect: 'pass' }];
```

- `meta` is read without running the module: `name`, `block` and `params` are literals (`FUD0941`), `name` is the file name (`FUD0942`) and `block` its folder (`FUD0943`).
- `run(ctx, args)` gets the arguments by parameter name (a `number` arrives as a number). A `then` returns `{ pass, evidence: { expected, actual } }`, both as text a person reads; that is what a red report shows. A `when` or `given` returns a sentence of what it did.
- `ctx.page` is the Playwright page; `ctx.locate(ref)` a locator that must match one element; `ctx.act(target, gesture)` runs a gesture and waits until the page served it (every `when` that touches the page goes through it); `ctx.text(target)` the text a person sees.
- A project term exports `selfTest` (`FUD0946`) and `run` (`FUD0945`).

## Running it

`fudic_spec_run { spec: "app-post" }` runs the criteria of one component (a tag or a path), of a page (`/shop`, `/blog/[slug]`) or of a flow (`checkout`); without `spec`, every `.fudspec`. `criteria: ["min-height"]` runs some; `failing: true` only those that did not pass last time. A page or a flow also answers `calls`: by criterion, every call it made, with its arguments, whether the fixture answered it (`faked`) and its status.

`fudic_render { route: "/shop", fixture: { data: "none" } }` and `fudic_preview` with the same `fixture: { data, answers, services }` show a route the way a criterion opens it (`FUD1516` for a name the fixture does not have, `FUD1517` with no fixture).

Only what did not pass is detailed: the criterion and its place in the `.fudspec`, the red step with what it expected and what it got, the element it located back in the `.fud` (`source`, `quote`), a screenshot under `.fudic/runs/`, and the errors of the page.

- **pass**: every `then` passed.
- **fail**: a `then` said no. Before the view exists, this is the right red: the criterion runs and finds nothing (`actual: not there`).
- **error**: the criterion could not reach a verdict: the page did not load (`FUD1200`), an unknown term (`FUD1201`), a step out of time (`FUD1202`), a reference matching several elements (`FUD1203`), a term that threw (`FUD1204`), an error in the page (`FUD1205`), `fudic/bench.js` failed (`FUD1206`), anything else (`FUD1207`). An error is never the right red: fix it before going on.

A `.fudspec` with diagnostics runs nothing; `fudic_check` reports them like any other file. After an edit of the `.fud`, run `fudic_test` first (milliseconds), then `fudic_spec_run` to confirm (seconds).
