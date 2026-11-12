# `@fudic/terms`

The terms a `.fudspec` criterion is written with. Each line of a `given`, `when` or `then` is a
term, and this package gives every term what it runs on: a `ctx` over the real Playwright page
the workbench mounts the component in, its types, and a stock vocabulary — so a new project
writes criteria without writing a single term.

```sh
pnpm add -D @fudic/terms
```

## The stock vocabulary

| Block | Term | Passes when |
|---|---|---|
| `when` | `click <target>` | — clicks it |
| `when` | `press <target> "<key>"` | — focuses it and presses `x`, `Enter`, `Shift+Tab`… |
| `when` | `type <target> "<text>"` | — types into it |
| `when` | `focus <target>` | — focuses it |
| `when` | `set-attribute <target> <attribute> "<value>"` | — sets it |
| `then` | `present <target>` | it is in the page, even empty and taking up no room |
| `then` | `visible <target>` | it is visible: on screen, with a size |
| `then` | `hidden <target>` | it is not |
| `then` | `text <target> "<expected>"` | the text a person sees contains it |
| `then` | `attribute <target> <attribute> "<expected>"` | the attribute has that value |
| `then` | `focused <target>` | it has the focus, across shadow roots |
| `then` | `slotted <target> <slot>` | it went to that slot of its host (`default`: the unnamed one) |
| `then` | `min-height <target> <px>` · `min-width <target> <px>` | it is at least that big |

For pages and flows (and what makes sense of them without a server, on a component too):

| Block | Term | Passes when |
|---|---|---|
| `given` | `cookie <name> "<value>"` | — the browser has it, for the whole site, before the page opens |
| `given` | `locale <tag>` | — `Accept-Language` and `navigator.language` say it |
| `given` | `media <feature> <value>` | — `prefers-color-scheme dark`, `prefers-reduced-motion reduce`… |
| `given` | `viewport <width> <height>` | — the window is that big |
| `given` | `clock <instant>` | — the browser and the criterion's server stand at that time until a `wait` |
| `given` | `offline` | — opens without network, after a visit that installs the Service Worker |
| `when` | `go <url>` · `back` · `forward` · `reload` | — the address bar and the history |
| `when` | `check <target>` · `uncheck <target>` | — clicks the checkbox |
| `when` | `select <target> "<option>"` · `hover <target>` | — picks by the option's text · moves the mouse over it |
| `when` | `upload <target> "<file>"` | — chooses that file, relative to the `.fudspec` |
| `when` | `wait <ms>` | — moves the clock (both with `clock`, real time without) |
| `when` | `offline` · `online` | — cuts the network, or gives it back |
| `then` | `title "<expected>"` · `url <path>` | the document's title · where the page is |
| `then` | `status <code>` · `header <name> "<expected>"` | of the last document response |
| `then` | `count <target> <n>` | the reference gives that many |
| `then` | `value <target> "<expected>"` | the control has that value |
| `then` | `checked` · `unchecked` · `enabled` · `disabled` `<target>` | the control is so |
| `then` | `called <fn> <times>` | the function or remote rule was called that many times |
| `then` | `sent <fn> <field> "<expected>"` | in its last call, the field had that value |
| `then` | `lists "<value>"` | the real `paths()` of the route includes it |
| `then` | `not-reloaded` · `requests <n>` · `downloaded "<name>"` | over the last `when` block |

A target is a tag (`ui-menu`), a role with its exact name (`role:menuitem/"Open"`) or with a name
that contains a text (`role:row/~"Ana"`), and steps joined by `>` each look inside the one before
(`role:row/~"Ana">role:checkbox/"Activo"`). A term of your own in `fudic/terms/<block>/<name>.js`
replaces the stock one of the same name.

A `then` runs on a quiet page — no request on its way, no short timer, no frame pending — and a
positive one is tried again until it holds or 5 s pass. A term that holds by what is NOT there
says so with `meta.negative` (`true`, or a function of its arguments, as `count … 0`): it is read
once.

## Writing a term

```js
// fudic/terms/then/has-class.js
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

export const selfTest = [{ args: { target: 'ui-card', name: 'raised' }, expect: 'pass' }];
```

A `then` answers its `evidence` as an `Evidence`: what it looked for and what it found, both as
text a person reads — `{ expected: 'at least 44px', actual: '32px' }`. Every stock `then` does,
whether it passes or not; when the element is missing, `actual` is `not there`. That is what the
report of a red criterion shows, so write the value the way you would say it. A term that
answers a sentence, or `null`, still works: the report then takes its `describe` (or the step as
written) as what was expected, and the sentence (or `—`) as what was found. A `when` or a `given`
answers a sentence of what it did.

`ctx` has four things:

- `page` — the Playwright `Page`: keyboard, mouse, `evaluate`…
- `locate(ref)` — a Playwright `Locator`. A reference must match one element: more is an error
  that says how many. The element it reads or acts on is marked in the shot, with the place in
  the `.fud` that wrote it.
- `act(target, gesture)` — runs a gesture and waits until the page has served it, hydration
  included. A `when` that touches the page goes through it.
- `text(target)` — the text a person sees, across shadow roots and slots.

And what it knows of the criterion (`CriterionRecord`): `url` and `resolve(path)` (relative to
the `.fudspec`), `quiet()` (waits for the quiet page), `clock()` and `advance(ms)`, `calls()` (what
the page asked the server, answered by the fixture or for real), `response()` (the last document
response), `lastWhen()` (the requests and downloads of the last `when` block), `reloaded()` and
`paths()` (the route's real `paths()`). On a component, `calls()` is empty and `paths()` is null.

## Extending the workbench

`fudic/bench.js` in your project extends the `ctx` of every term, and can prepare the page
before the component is mounted:

```js
import { defineExtension } from '@fudic/terms';

export default defineExtension({
  async setup(page) {
    await page.emulateMedia({ colorScheme: 'dark' });
  },
  context: (ctx) => ({
    ...ctx,
    async openMenu(ref) {
      const el = ctx.locate(ref);
      await ctx.act(el, () => el.press('Enter'));
    },
  }),
});
```

A term of the project sees those methods, typed, when its `run` says so —
`fudic g term` writes this line for you when `fudic/bench.js` exists:

```js
/** @type {import('@fudic/terms').Term<string, import('@fudic/terms').ContextOf<typeof import('../../bench.js').default>>['run']} */
export async function run(ctx, { target }) {
  await ctx.openMenu(String(target));
  return { pass: true, evidence: `opened ${target}` };
}
```

## Fixtures

A fixture entry may carry `$content`: HTML that goes inside the host, as its children — how a
slot gets filled.

```ts
import type { Fixtures } from '@fudic/terms';
import type { $Props } from './ui-card.fud';

export default {
  base: {},
  withIcon: { $content: '<span slot="icon" role="img" aria-label="star">★</span>' },
} satisfies Fixtures<$Props>;
```
