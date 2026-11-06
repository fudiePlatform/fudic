# pages

Routes, layouts, a page's data (`load`), calling the server from a page, error pages and the session.

## Routes come from the file system

| File | URL |
|---|---|
| `src/routes/index.fud` · `about.fud` · `blog/index.fud` | `/` · `/about` · `/blog` |
| `src/routes/blog/[slug].fud` | `/blog/:slug`, read on the server as `ctx.params.slug` |
| `src/routes/_error.fud` | none: the error page |

- A parameter is `[name]`; static segments win over it. A layout or component under
  `src/routes` is not a route.
- A **route** starts with `<link rel="layout" href="…">` and writes no `<!DOCTYPE>`, `<html>` or
  `<body>`: an optional `<head>` fragment (its `<title>`), `@section`s and markup, in this order:
  `<link rel="layout">`, `<link rel="component">` and `<link rel="server">`, `@code`, `<head>`,
  the rest (`FUD0421`). A **page document** has no layout: a whole `<!DOCTYPE html>` document
  shaped like the layout below, its `<title>` in `<head>`, its markup in `<body>`.
- `fudic_generate { kind: "page" }`, given the URL (`/products`, `blog/:slug`), writes the
  route linked to the nearest `_layout.fud` (up from the page, then `src/layouts/_layout.fud`),
  one empty `@section` per section of that layout and a unit test; with no layout, a page
  document. `fudic_generate { kind: "api" }` then adds the `.fudapi` with a `load` and its handler.

## Layouts

A whole document with holes, in `src/layouts`. `fudic_generate { kind: "layout" }` writes one.

```fud path=src/layouts/_layout.fud
<!DOCTYPE html>
<html lang="en">
  <head>
    @code {
      const { area = "Shop" } = props<{ area?: string }>();
    }
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="article:section" content="@area">
    @* Keep this line: fudic puts its scripts here. *@
    <script type="module" src="fudic:runtime"></script>
    @RenderHead()
  </head>
  <body>
    @RenderSection(nav)
    <main>@RenderBody()</main>
  </body>
</html>
```

- `@RenderBody()`: the route's markup, exactly once (`FUD0423`, `FUD0424`). `@RenderHead()`:
  the route's `<head>`, inside `<head>` (`FUD0431`; missing, `FUD0425`).
- `@RenderSection(name)`: filled by `@section name { … }`, else empty; with `required: true` it
  must be filled (`FUD0890`). A `@section` the layout does not render is `FUD0429`.
- Keep the `fudic:runtime` script: without it a page never reacts to a click. A layout never
  links another layout (`FUD0439`) nor a `.fudapi` (`FUD1112`).
- Props: declared in a `@code` inside `<head>` holding only `props<…>()` (`FUD0700`), read only
  in the head, never in `<body>` (`FUD0704`). A route resolves them in `layout` of its `.fudapi`;
  a prop with no default that the route leaves out is `FUD0702`.

## `load`: the data of a page

`load` is declared in the `.fudapi` beside the route (same folder, same name; elsewhere
`FUD1090`), implemented in `src/server`, and read in the view as `data`. The route links it
with `<link rel="server" href="./x.fudapi">`. It runs on the server only. Its line is
`load [ssg|ssr|sw] [ttl <dur>] [<policy>] [page never|persist [<dur>]] [buffer <bytes>]`.

| Mode | What happens |
|---|---|
| `ssg` | The build runs `load` and writes the HTML. With parameters it needs `paths` (`FUD0398`). |
| `ssr` | The server renders it on every request. Write it for anything that depends on who asks. |
| `sw` | The Service Worker renders it, with its data from an endpoint fudic generates. |
| none written | No parameters: `sw` (a page with no `load` is `ssg`). Parameters: `ssg` with `paths`, values it does not list rendered on demand; `sw` without. `ssr` is never inferred. |

- No `sw.json` at the project root (`fudic new` writes one unless `--no-sw`): no Service Worker,
  and the server serves every page.
- `ttl 5m` (`s`, `m`, `h`, `d`) and a policy (`cache-first`, `network-first`,
  `stale-while-revalidate`, `network-only`): how the Service Worker keeps the data. `page
  persist [<dur>]` keeps the rendered HTML of an `sw` page too (default `never`).
- `buffer`: bytes the page stream holds before sending; `0` sends every piece at once, `16k`
  groups up to 16384, default 8192 (`FUD1325`). A bad option is `FUD1074`.
- `load` takes `use` / `skip`, never `fails` (`FUD1360`). A `load` that throws `notFound()` or
  `forbidden()` answers with that status and paints `_error.fud`; `redirect("/")` redirects.

```fudapi path=src/routes/blog/[slug].fudapi
# Prerendered once per slug that paths gives; another slug is rendered on demand.
load
  title  str
  body   str

# Every slug the build prerenders.
paths

# The props of _layout.fud, resolved after load.
layout
```

```ts path=src/server/routes/blog/[slug].ts
import { notFound } from '@fudic/http';
import { layout, load, paths } from 'fudic:routes/blog/[slug]';

const posts = [{ slug: 'hello', title: 'Hello', body: 'The first post.' }];

load.handle((ctx) => {
  const post = posts.find((p) => p.slug === ctx.params.slug);
  if (post === undefined) throw notFound(`There is no post called "${ctx.params.slug}".`);
  return { title: post.title, body: post.body };
});

paths.handle(() => posts.map((p) => p.slug));

layout.handle(() => ({ area: 'Blog' }));
```

```fud path=src/routes/blog/[slug].fud
<link rel="layout" href="../../layouts/_layout.fud">
<link rel="server" href="./[slug].fudapi">

<head>
  <title>@data.title</title>
</head>

<h1>@data.title</h1>
<p>@data.body</p>
```

`paths` returns the values of the route's parameter and exists only on a route with parameters
(`FUD1091`). The `layout` handler receives `(ctx, data)`, `data` being what `load` returned.

## `later` fields and `@await … @catch`

A `load` field ending in `later` is a promise the handler returns unawaited: the page goes out
without it and the view paints it inside `@await data.<field>`. Only fields of `load` (`FUD1324`).

```fudapi path=src/routes/dashboard.fudapi
# The title comes with the first byte; each later field when its promise settles.
load ssr
  title    str
  summary  Summary  later
  alerts   str  later

type Summary
  total   i32
  active  i32
```

```ts path=src/server/routes/dashboard.ts
import { notFound } from '@fudic/http';
import { load } from 'fudic:routes/dashboard';

const after = <T>(ms: number, value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

load.handle(() => ({
  title: 'Dashboard',
  summary: after(2000, { total: 12, active: 9 }),
  alerts: after(3000, null).then(() => {
    throw notFound('the alerts service does not answer');
  }),
}));
```

```fud path=src/routes/dashboard.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./dashboard.fudapi">

<h1>@data.title</h1>

@await data.summary {
  <p>@data.summary.active of @data.summary.total are active.</p>
}

@await data.alerts {
  <p>@data.alerts</p>
} @catch (e) {
  <p>Could not load the alerts (@e.status @e.title).</p>
}
```

- Inside `@await` the field is the value; read elsewhere (`<p>@data.summary.total</p>` outside
  the block) it is `FUD1321`. `@await` on anything but a `later` field of `data` is `FUD1320`.
- Only in the body of a route or page document, or a `@section`; never in `<head>`, a component
  or a layout (`FUD1322`): pass the resolved value to a component as a prop.
- `@catch (e)` is optional, right after the brace (`FUD1323`); `e` has `status` and `title`. No
  loading branch. Each `@await` waits for the one before it: put slow ones last.
- Whether the page exists is decided in `load` before it returns: after the first byte, `200`.

## Error pages

`_error.fud` has no URL and no `load`. It paints when a `load` throws, when no route matches,
and when a call fails and the `error-pages` middleware (topic fudapi) sends the browser there.
Its `data` is `ErrorPage` of `@fudic/http`: `status`, `title`, `path`, and `detail` and `back`
when known.

```fud path=src/routes/_error.fud
<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Error @data.status</title>
</head>

<h1>@data.status · @data.title</h1>
@if (data.detail !== undefined) {
  <p>@data.detail</p>
}
```

## Calling the server: `task`

The functions of a linked `.fudapi` are in the `@code` and the view by name, unimported:
`await login({ user })`. `task` of `@fudic/core` adds state, cancellation and order.

```fudapi path=src/routes/products.fudapi
# Per request: the list changes, and `session` is read from the session cookie.
load ssr
  products  Product[]
  session   str?

# Sets the session cookie; the page asks for its data again, which says who is in.
post login
  invalidates /products
  user  str

get search
  q  str
    max-length 80
  -> Product[]

# A 409 is the page's to paint: `catches` keeps it here.
put save
  catches 409
  fails locked 409 "That product is locked."
  id      i32
  active  bool

type Product
  id      i32
  name    str
  active  bool
```

```ts path=src/server/routes/products.ts
import { setCookie } from '@fudic/http';
import { load, login, save, SaveFails, search, type Product } from 'fudic:routes/products';

let products: readonly Product[] = [{ id: 1, name: 'Coffee', active: true }];

load.handle((ctx) => {
  const session = ctx.cookies.get('sid');
  return { products, ...(session !== undefined ? { session } : {}) };
});

login.handle((ctx) => setCookie(ctx, 'sid', ctx.args.user));

search.handle((ctx) => products.filter((p) => p.name.includes(ctx.args.q)));

save.handle((ctx) => {
  if (ctx.args.id === 1 && !ctx.args.active) throw SaveFails.locked();
  products = products.map((p) => (p.id === ctx.args.id ? { ...p, active: ctx.args.active } : p));
});
```

```fud path=src/routes/products.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./products.fudapi">

@code {
  import { signal, task } from "@fudic/core";

  const text = signal("");
  const found = task(search, () => ({ q: text() }), { initial: [] });
  const saving = task(save);

  function edit(e: Event) {
    text.set((e.target as HTMLInputElement).value);
  }

  async function turnOff() {
    const result = await saving.run({ id: 1, active: false });
    if (result.ok) text.set("");
  }

  async function signIn() {
    await login({ user: "ana" });
  }
}

<h1>Products</h1>
<p>Signed in: @(data.session === undefined ? "nobody" : data.session)</p>
<button @click=@signIn>Sign in as Ana</button>
<button @click=@turnOff>Turn Coffee off</button>
<ul>
  @foreach (const p of data.products) key (p.id) {
    <li>@p.name</li>
  }
</ul>
<input type="search" aria-label="Search" @input=@edit>
<span role="status">@(found.pending() ? "Searching…" : "")</span>
@foreach (const p of found.value()) key (p.id) {
  <p>Found: @p.name</p>
}
@if (saving.message() !== "") {
  <p role="alert">@saving.message()</p>
}
```

`task(fn, source?, { initial?, mode? })` takes the function, not a call:

- With `source` it calls on each change of the signals `source` reads; without, only on
  `run(args)`. Never on creation (and never on the server): the first data is `load`'s, via `initial`.
- A `get` keeps the latest call, aborting the one in flight; other verbs queue. `mode: "latest"
  | "queue"` overrides it.
- Tracked reads: `value()` (last answer, or `initial`), `state()` (`idle`, `pending`, `done`,
  `failed`, `cancelled`), `pending()`, `error()`, `message()` (the text of `error()`, or `""`).
- `run(args)` never rejects: `{ ok: true, value }`, `{ ok: false, status: "failed", error }` or
  `{ ok: false, status: "cancelled" }`. `cancel()` aborts and drops what waits.
- A status in the function's `catches`, or a 422, reaches the caller (`error()`, `ok: false`).
  With `error-pages` in the chain any other failure navigates away (`_error.fud`, or its
  `routes`) and the task stays `pending`. A `fails` text is the `.fudapi`'s, in the page's locale.

## Repaint after a mutation

A page repaints only when its path is in the `invalidates` of the function it called (`login`
above): the browser asks the server for `data` again, the page repaints (keyed rows, scroll and
focus kept, a `signal(data.x)` seeded again), and then the call resolves. Otherwise nothing
reloads: set your signals from what the call returned. A call that is not a `get` also drops
the Service Worker's data for the current page. Paths may be patterns: `invalidates /blog/:slug`.

## The session: a cookie

An `HttpOnly` cookie only server code writes, as `login` does above; read it with
`ctx.cookies.get(name)` in a `load`, a handler or a middleware.

- `setCookie(ctx, name, value, options?)` writes `Path=/; HttpOnly; Secure; SameSite=Lax`
  (no `Secure` on localhost); options `maxAge`, `expires`, `path`, `domain`, `sameSite`,
  `secure`, `httpOnly`, `partitioned`. `deleteCookie(ctx, name)` removes it. Both work in a
  `load` too, even right before a `throw`.
- An answer that read the session (`ctx.cookies`, or the `cookie` or `authorization` header)
  goes out `Cache-Control: private, no-store` unless the handler set its own, and the Service
  Worker never keeps it: one user's cached page never reaches another.
- A prerendered page whose `load` or `layout` reads the session is `FUD1300`: write `load ssr`.

## Translations, briefly

`"locales": ["en", "es"]` and `"site": "https://example.com"` in `fudic.json` build each page
per locale, under `/en/…` and `/es/…`; the first is the code's language. Text nodes and
attributes like `title`, `alt` need no marking; a text inside a value (a prop, a `.ts` module)
goes in `t()` of `@fudic/i18n`: `.title=@t("About")`. `fudic translate` writes
`src/locales/<locale>/…json`, `.fudapi` texts included; fill in each `translation`.

Check with `fudic_check`. Related topics: view, components, fudapi, testing.
