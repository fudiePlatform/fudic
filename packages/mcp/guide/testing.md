# testing

Unit tests with `@fudic/testing` (vitest on happy-dom): mounting, queries, gestures, the in-memory server, and the boundary with the `.fudspec`.

## Which goes where

Two loops. Outside, the acceptance criteria (`.fudspec`, a real browser, topic `fudspec`), which the user approves. Inside, unit tests, which you write without asking.

| `.fudspec` (browser) | Unit test (happy-dom) |
|---|---|
| What a person would check by looking and touching | What the user does not see and would not approve |
| One user sentence = one criterion ("disabled does nothing") | Each prop variant; edge values (empty, very long, `0`, HTML characters) |
| Keyboard, focus, accessibility, visible, size and layout | The `detail` of each event |
| | Server functions and each of their failures; each rule of a form |
| | The options of the shadow root |
| Approved by the user | Written by you, no approval |

- **What is already a criterion is not repeated as a unit test.** If `app-tabs.fudspec` checks that a click on "Tab B" shows its panel, no unit test checks it again.
- happy-dom does no layout, no real focus and no ARIA references across shadow roots: a unit test of focus, size or visibility passes without proving anything. Those are criteria.

## The order: red, then the view

1. Props and criteria approved (topic `fudspec`).
2. Write the unit tests. Run `fudic_test` and `fudic_spec_run`: **both must be red for the right reason**.
3. Write the view until both are green. In this phase **do not change the tests**: change the `.fud`.

The right red is `fail`: an assertion ran and said no. `broken` means the test never reached an assertion: the `.fud` does not compile (its `FUD` codes come with the report), an import is missing, `mount` threw, a query threw, a timeout. A broken test proves nothing; fix it before going on.

`getByRole`, `getByLabelText` and `getByText` **throw** when they find no element or several: before the view exists, a test that starts with `t.click(t.getByRole(…))` is `broken`, not `fail`. Open such a test with an assertion that can fail: `expect(t.queryByRole('button', { name: '+1' })).toBeInTheDocument()`, or `expect(t.query('output')).toHaveTextContent('2')`.

## Setup

`fudic new` writes `vitest.config.ts` with `fudicTest()` (your `fudic()` plugin, plus the `fudic` environment) and `include: ['src/**/*.test.ts']`. A test lives next to what it tests: `src/components/app-counter/app-counter.test.ts`. `fudic_generate` writes a first green test with every component, page, layout, snippet, form and pipe.

## Components: `mount`

```ts
const t = await mount(AppCounter, { props: { start: 2 } });
```

- `import * as AppCounter from './app-counter.fud'` is what `mount` takes. A `.fud` with errors fails at import, with its diagnostics.
- `via: 'ssr'` (default): the server's HTML, its declarative shadow roots, then hydration, as in the browser. The first click on a host not hydrated yet still counts. Props must be JSON, plus `Date` at any depth.
- `via: 'client'`: the element created as a parent creates it; any value as a prop.
- Other options: `url` (the page it lives in, `/` by default), `providers: [{ provide, use }]` (replace a service, on both sides), `fetch` (answer the server functions yourself), `sw: true` (a simulated Service Worker; `t.invalidated` lists what it was told to invalidate).
- The result: `t.host` (the element), `t.root` (its shadow root), the queries and gestures, `t.props({ … })` (change props as a parent would, then wait for the repaint), `t.settled()`, `t.unmount()`.
- An app with `"locales"` mounts in its first locale: pipes format and `t()` translates.

**Queries** reach into every shadow root below: `getByRole(role, { name })`, `getByLabelText(text)`, `getByText(text)` (throw unless exactly one), `queryByRole(role, { name })` (`null` when none), `query(selector)` (CSS, first match or `null`), `errorOf(label)` (the text of a form control's error slot, or `null`).

**Gestures** resolve once everything they started has finished (requests to the in-memory server, chunks, signals): `click(el)`, `type(el, text)`, `clear(el)`, `blur(el)`, `submit(form?)` (the one form under the root when none is given). There is no keyboard or focus gesture: that is a criterion.

Assertions are vitest's `expect` plus jest-dom's matchers (`toBeInTheDocument`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`…).

```fud path=src/components/app-counter/app-counter.fud
@code {
  /** A counter that starts at `start` and adds one per click. */
  import { signal } from "@fudic/core";

  const { start = 0 } = props<{
    /** The first number shown. */
    start?: number;
  }>();

  const n = signal(start);

  function inc() {
    n.set(n() + 1);
  }
}

<app-counter>
  <template shadowrootmode="open">
    <button type="button" @click=@inc>+1</button>
    <output>@n()</output>
  </template>
</app-counter>
```

```ts path=src/components/app-counter/app-counter.test.ts
import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as AppCounter from './app-counter.fud';

test('without start, it starts at 0', async () => {
  const t = await mount(AppCounter);
  expect(t.query('output')).toHaveTextContent('0');
});

test('the first click wakes it up, and counts from start', async () => {
  const t = await mount(AppCounter, { props: { start: 2 } });
  expect(t.query('output')).toHaveTextContent('2');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('3');
});

test('a new start, from the parent, repaints', async () => {
  const t = await mount(AppCounter, { via: 'client', props: { start: 5 } });
  expect(t.query('output')).toHaveTextContent('5');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('6');
});
```

**Prop variants from the fixture.** The fixture of the `.fudspec` is a module: import its cases instead of writing the props twice, and test what the criteria leave out. For `app-post` (topic `fudspec`), the criteria cover the link and the highlight; the default variant and an unsafe title are unit tests:

```ts path=src/components/app-post/app-post.test.ts
import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import fixtures from './app-post.fixture';
import * as AppPost from './app-post.fud';

test('without a variant, the default one', async () => {
  const t = await mount(AppPost, { props: fixtures.base });
  expect(t.query('article')).toHaveClass('card');
  expect(t.query('article')).not.toHaveClass('highlight');
});

test('a title is text, never markup', async () => {
  const t = await mount(AppPost, { props: { title: '<b>bold</b>', href: '/' } });
  expect(t.query('b')).toBeNull();
  expect(t.query('h2')).toHaveTextContent('<b>bold</b>');
});
```

**Events.** To check the `detail` of an event, add a listener before the gesture and read `(e as CustomEvent).detail`; an `emit(name, detail)` of `@fudic/dom` is heard on `document`. Remove the listener in a `finally`.

## Shadow root options and the accessibility tree

`shadowOf(host)` returns what the shadow root was really created with: `mode`, `delegatesFocus`, `clonable`, `serializable`, `referenceTarget` and `adoptedStyleSheets` (`'self'` for the component's own `<style>`). Check it once per `via`: the server path and the client path must agree. `outline(root)` writes what a screen reader meets, in Playwright's ARIA snapshot format: one line per element with a role, its name and its states.

```fud path=src/components/app-button/app-button.fud
@code {
  /** A button that hands its focus to the inner button. */
  const { label, disabled = false } = props<{
    /** The text of the button. */
    label: string;
    /** A disabled button cannot be pressed. */
    disabled?: boolean;
  }>();
}

<head>
  <style>
    button { font: inherit; }
  </style>
</head>

<app-button>
  <template shadowrootmode="open" shadowrootdelegatesfocus>
    <button disabled=@disabled>@label</button>
  </template>
</app-button>
```

```ts path=src/components/app-button/app-button.test.ts
import { describe, expect, test } from 'vitest';
import { mount, outline, shadowOf } from '@fudic/testing';
import * as AppButton from './app-button.fud';

describe.each(['ssr', 'client'] as const)('via %s', (via) => {
  test('the shadow root delegates the focus and adopts its own sheet', async () => {
    const t = await mount(AppButton, { via, props: { label: 'Save' } });
    expect(shadowOf(t.host)).toEqual({
      mode: 'open',
      delegatesFocus: true,
      clonable: false,
      serializable: false,
      referenceTarget: null,
      adoptedStyleSheets: ['self'],
    });
  });
});

test('disabled, a screen reader meets a disabled button named Save', async () => {
  const t = await mount(AppButton, { props: { label: 'Save', disabled: true } });
  expect(outline(t.root)).toBe('- button "Save" [disabled]');
});

test('enabled, the same button without the state', async () => {
  const t = await mount(AppButton, { props: { label: 'Save' } });
  expect(outline(t.root)).toBe('- button "Save"');
});
```

`outline` does not know what CSS hides: what is visible is a criterion. `renderToHtml(X)` returns the server's HTML, and `toContainTemplate({ … })` checks its `shadowroot*` attributes.

## Server functions: the in-memory server

Nothing is mocked unless you mock it. A call from a component goes through the client chain, the wire format and the dispatcher to the real handler in `src/server`, and back. The component, its `.fudapi` and its handler (topic `fudapi`; `fudic_generate { kind: "api" }` writes the last two and adds `@fudic/http`):

```fudapi path=src/components/app-hello/app-hello.fudapi
# The server functions of the component: their handlers are in src/server/components/app-hello/app-hello.ts.
post greet
  name  str
  -> str
```

```ts path=src/server/components/app-hello/app-hello.ts
import { greet } from 'fudic:components/app-hello/app-hello';

greet.handle((ctx) => `Hello, ${ctx.args.name}`);
```

```fud path=src/components/app-hello/app-hello.fud
<link rel="server" href="./app-hello.fudapi">

@code {
  /** A button that asks the server for a greeting, and says why when it cannot. */
  import { signal } from "@fudic/core";

  const said = signal("");
  const failed = signal("");

  async function go() {
    try {
      said.set(await greet({ name: "Ana" }));
    } catch (e) {
      const status = (e as { status?: number }).status;
      failed.set(status === undefined ? (e as Error).name : String(status));
    }
  }
}

<app-hello>
  <template shadowrootmode="open">
    <button type="button" @click=@go>Greet</button>
    <output role="status">@said()</output>
    <p role="alert">@failed()</p>
  </template>
</app-hello>
```

```ts path=src/components/app-hello/app-hello.test.ts
import { expect, test } from 'vitest';
import { mount, respond, respondProblem } from '@fudic/testing';
import { greet } from 'fudic:components/app-hello/app-hello';
import * as AppHello from './app-hello.fud';

test('the real handler answers, through the whole chain', async () => {
  const t = await mount(AppHello);
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('status')).toHaveTextContent('Hello, Ana');
});

test('an answer written by the test, in the format of the function', async () => {
  const t = await mount(AppHello, { fetch: () => respond(greet, 'Hello, Eva') });
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('status')).toHaveTextContent('Hello, Eva');
});

test('a 409 reaches the view with its status', async () => {
  const t = await mount(AppHello, { fetch: () => respondProblem(greet, { status: 409, title: 'Conflict' }) });
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('alert')).toHaveTextContent('409');
});

test('a network failure reaches the view as in a browser', async () => {
  const t = await mount(AppHello, {
    fetch: () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('alert')).toHaveTextContent('TypeError');
});
```

- `fetch: (request) => Response` takes the server's place for one test: for network failures, 500s and each declared failure of a function.
- `respond(fn, value, init?)` and `respondProblem(fn, problem)` write the `Response` in the function's own format (binary unless its chain says JSON). A `Response.json(…)` is not one a call understands.
- A request outside `/_fudic/fn/` throws and names the URL.
- To change what the handler sees, mock the module it reads, not the call: `vi.mock('../../data/people', () => ({ emailTaken: async (e: string) => e === 'ana@example.com' }))`.
- One module graph serves the test, the client and the server: module state (a form object, a store signal) is shared between both sides and between the tests of a file. Reset it in a `beforeEach` (`form.$reset()`).
- `clientGraphOf(X)` walks what the browser would download; `expect(await clientGraphOf(AppHello)).not.toReach('src/data/people.ts')` checks that server code stays out.

## Forms: each rule

`fudic_generate { kind: "form", name: "person" }` writes the form and its test. Test each rule of each field, and in a mounted component that `t.errorOf('Name')` shows its text after `t.submit()`.

```fudapi path=src/forms/person.fudapi
# Every field says its type, its rules and their texts; both ends take it from here.
form personForm
  name  str = ""
    required  "Name is required."
```

```ts path=src/forms/person.test.ts
import { expect, test } from 'vitest';
import { personForm } from 'fudic:forms/person';

test('asks for the name', async () => {
  expect(await personForm.$validate()).toBe(false);
  personForm.name.set('Ada');
  expect(await personForm.$validate()).toBe(true);
});
```

## Pipes

A pipe is tested by calling its `format(value, locale)`:

```ts path=src/pipes/initials.test.ts
import { expect, test } from 'vitest';
import initials from './initials';

test('initials gives the upper-case initials of a name', () => {
  expect(initials.format('ada lovelace', 'en')).toBe('AL');
  expect(initials.format('  grace   brewster hopper ', 'en')).toBe('GBH');
  expect(initials.format('', 'en')).toBe('');
});
```

## Pages, layouts and snippets

```ts path=src/routes/index.test.ts
import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
});
```

- `visit(url)` runs the page's `load` through the test's module graph; `visit(url, { data: { … } })` skips `load`. It gives `page.status`, `page.document` and the same queries and gestures. A `load` that throws renders `_error.fud` with its status; a redirect makes `visit` throw and name the target.
- `renderLayout(Layout, { body: '<p>body</p>', sections: { nav: '<a href="/">Home</a>' } })` renders a layout around that HTML; read it in `page.document`.
- `renderSnippet('./ui.fud', 'card("Hi", tone: "info")')` expands a snippet, written as after `@render`, from a file relative to the test; `{ scope: { item: { id: 1 } } }` gives names its arguments can read (`'row(@item)'`).

## Running them

`fudic_test` runs the project's tests in process; `paths: ["src/components/app-counter"]` limits the files, `names: ["…"]` the tests, `failing: true` repeats only what did not pass last time. Only what did not pass is listed: `fail` with its file, test name, the line of the `expect` and what was expected against what came; `broken` with its diagnostics (a `.fud` that does not compile comes with its codes and its place in the `.fud`; anything else is `FUD1207` with the original message).

Run `fudic_test` after every edit of the view: it takes milliseconds. `fudic_spec_run` confirms in the browser.
