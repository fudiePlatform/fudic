# `@fudic/testing`

Unit tests for a fudic app in vitest. Mount a component, visit a route, render a layout or
expand a snippet in happy-dom. The HTML is the one the server sends and the hydration is the
one the browser runs. When a component calls a server function, an in-memory server answers it
with the real chain.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

export default defineConfig({ plugins: [fudicTest()] });
```

`fudicTest(options?)` is your `fudic()` plugin with the same options. It also puts vitest in
the `fudic` environment at `http://localhost/`.

## Components

```ts
import { mount } from '@fudic/testing';
import * as AppCounter from './app-counter.fud';

test('adds on click', async () => {
  const t = await mount(AppCounter, { props: { start: 2 } });
  await t.click(t.getByRole('button', { name: '+' }));
  expect(t.getByRole('status')).toHaveTextContent('3');
});
```

- `via: 'ssr'` is the default. The server's HTML goes in, its declarative shadow roots are
  applied, and hydration is installed. The first click on a host that has not hydrated yet
  still counts. Props must be JSON.
- `via: 'client'` creates the element the way a parent does, with any value as a prop.
- The queries and gestures come from Testing Library. Queries reach into child shadow roots,
  and a gesture resolves once everything it started has finished: requests, chunks and
  microtasks. `t.settled()` waits for the same things. `t.errorOf('Label')` reads the error
  slot of a form control.
- `t.props({ … })` changes props as a parent would.
- `providers: [{ provide, use }]` replaces a service in the tree, on the client and on the
  server.
- A `.fud` with errors fails at import, with the diagnostics printed as the build prints them.

## Server functions

Nothing is mocked unless you mock it. Each call goes through the client chain, the wire format
and `dispatch`, then reaches the server halves of the middlewares and `serverValidator`. To
change what the server sees, mock the data module:

```ts
vi.mock('../data/aliases', () => ({ aliasTaken: async (a: string) => a === 'admin' }));
```

- `fetch: (request) => Response` takes the server's place for one test. Use it for network
  failures and 500s.
- A request outside `/_fudic/fn/` throws and names the URL.
- `sw: true` adds a simulated Service Worker, and `t.invalidated` lists the paths it was told
  to invalidate.
- `clientGraphOf(X)` walks what the browser would download, without running it.
  `expect(graph).not.toReach('src/data/aliases.ts')` checks that server code stays out.

## Routes, layouts and snippets

```ts
const page = await visit('/blog/x');                  // load runs through vitest's graph
const page = await visit('/blog/x', { data: { … } }); // load skipped; layout(ctx, data) still runs
page.status; page.document.title;

await renderLayout(Layout, { body: '<p>body</p>', sections: { nav: '<a href="/">Home</a>' } });
await renderSnippet('../snippets/ui.fud', 'card("Hi", tone: "info")');
await renderSnippet('./fields.fud', 'row(@item)', { scope: { item: { id: 1 } } });
```

When a route throws in `load`, `visit` renders `_error.fud` with the error's status, the same
as `vite dev`. When it redirects, `visit` throws and names the target.

## Shadow roots

`shadowOf(host)` returns the options a shadow root was really created with: `delegatesFocus`,
`clonable`, `serializable`, `referenceTarget` and the adopted sheets (`'self'` for the
component's own). Mount once with each `via` and compare: the server path and the client path
must give the same result. `renderToHtml(X)` returns the server's HTML, and
`toContainTemplate({ … })` checks its `shadowroot*` attributes exactly.

## What belongs elsewhere

happy-dom does no layout, no real focus and no ARIA references across shadow roots. Test those
in a browser with a `.fudspec`.

One module graph serves the test, the client and the server. A module's state (a form object,
a global signal) is therefore shared between the two sides, and between the tests of one file.
Reset it in a `beforeEach`, for example with `form.$reset()`.

A component with a required prop that is not JSON, such as a form control, can only get it from
its parent. Mount the parent and query the child.
