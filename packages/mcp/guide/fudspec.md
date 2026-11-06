# fudspec

The `.fudspec` language: a component's acceptance criteria, written in the user's words, run in a real browser, approved by the user together with the props.

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
- The first line is `component <tag>` (`FUD0922` missing, `FUD0923` twice). The tag must be a component of the project (`FUD0949`).
- `criterion <slug>`: a kebab-case name, unique in the file (`FUD0927`). It names the criterion in every report.
- Blocks run `given`, `when`, `then`, each at most once (`FUD0930`). `given` and `when` are optional; `then` is not (`FUD0933`). An empty block is `FUD0934`.
- `#` starts a comment to the end of the line.
- Arguments: a bare token (`app-post`, `16`, `href`), a string in double quotes on one line (`"Tab B"`, `FUD0920` unclosed), or a role reference.
- Several `then` lines are all checked; a red one does not stop the others.

## Targets: tag or role with its name

A term that takes an element accepts:

- a tag: `app-post`, `article`, `time`;
- `role:<role>/"<name>"`: the element with that ARIA role and exactly that accessible name: `role:tab/"Tab B"`, `role:link/"Featured"`, `role:button/"Save"`;
- `role:<role>` alone, when there is only one: `role:tabpanel`.

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

- Each criterion gets its own page that mounts the component **alone**: no layout, no stylesheet the layout links, no navigation. Do not click a link that leaves the page; do not depend on a token the layout defines.
- A component not hydrated yet takes its first gesture anyway: a `when` waits until the page has served it, hydration included, so the `then` after it reads the new state.
- Criteria run in parallel, each with 30 s to load.

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

`fudic_spec_run { spec: "app-post" }` runs the criteria of one component (a tag or a path); without `spec`, every `.fudspec`. `criteria: ["min-height"]` runs some; `failing: true` only those that did not pass last time.

Only what did not pass is detailed: the criterion and its place in the `.fudspec`, the red step with what it expected and what it got, the element it located back in the `.fud` (`source`, `quote`), a screenshot under `.fudic/runs/`, and the errors of the page.

- **pass**: every `then` passed.
- **fail**: a `then` said no. Before the view exists, this is the right red: the criterion runs and finds nothing (`actual: not there`).
- **error**: the criterion could not reach a verdict: the page did not load (`FUD1200`), an unknown term (`FUD1201`), a step out of time (`FUD1202`), a reference matching several elements (`FUD1203`), a term that threw (`FUD1204`), an error in the page (`FUD1205`), `fudic/bench.js` failed (`FUD1206`), anything else (`FUD1207`). An error is never the right red: fix it before going on.

A `.fudspec` with diagnostics runs nothing; `fudic_check` reports them like any other file. After an edit of the `.fud`, run `fudic_test` first (milliseconds), then `fudic_spec_run` to confirm (seconds).
