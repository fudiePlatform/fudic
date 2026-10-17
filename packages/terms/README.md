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
| `then` | `visible <target>` | it is visible |
| `then` | `hidden <target>` | it is not |
| `then` | `text <target> "<expected>"` | the text a person sees contains it |
| `then` | `attribute <target> <attribute> "<expected>"` | the attribute has that value |
| `then` | `focused <target>` | it has the focus, across shadow roots |
| `then` | `slotted <target> <slot>` | it went to that slot of its host (`default`: the unnamed one) |
| `then` | `min-height <target> <px>` · `min-width <target> <px>` | it is at least that big |

A target is a tag (`ui-menu`) or a role with its exact name (`role:menuitem/"Open"`). A term of
your own in `fudic/terms/<block>/<name>.js` replaces the stock one of the same name.

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
  return { pass: classes.includes(String(name)), evidence: classes.join(' ') };
}

export const selfTest = [{ args: { target: 'ui-card', name: 'raised' }, expect: 'pass' }];
```

`ctx` has four things:

- `page` — the Playwright `Page`: keyboard, mouse, `evaluate`…
- `locate(ref)` — a Playwright `Locator`. A reference must match one element: more is an error
  that says how many.
- `act(target, gesture)` — runs a gesture and waits until the page has served it, hydration
  included. A `when` that touches the page goes through it.
- `text(target)` — the text a person sees, across shadow roots and slots.

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
