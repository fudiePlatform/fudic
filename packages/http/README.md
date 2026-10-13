# @fudic/http

Server functions for fudic. Write a function in the `@server` of a route or a component,
call it by name from the `@client` — no URLs, no headers, no `fetch`, and the types cross
on their own.

```html
@code {
  @server {
    import { inject } from '@fudic/di';
    import { get, put } from '@fudic/http';
    import { auth } from '../middlewares/auth';
    import { Users } from '../services/users';

    export const search = get()
      .args<{ q: string }>()
      .handle((ctx) => inject(Users).find(ctx.args.q));

    export const save = put()
      .use(auth)
      .form(userForm)
      .handle((ctx) => inject(Users).save(ctx.user, ctx.form.$value()));
  }

  @client {
    async function find(e: Event) {
      found.set(await search({ q: (e.target as HTMLInputElement).value }));
    }
  }
}

<input @input=@find>
<form control=@userForm form:="@save"> … </form>
```

The code of `handle` never reaches the browser. There, `search` is a
`ServerFunction<{ q: string }, User[]>`: it takes the arguments and an optional
`{ signal, params }`, and returns a promise of what `handle` returned.

## Builders

A function opens with its verb — `get`, `post`, `put`, `patch`, `del` — is configured in the
order it is written, and closes with `.handle`. Every call returns a new builder, so a base can
be kept and continued:

```ts
const secured = put().use(auth, audit);

export const save   = secured.form(userForm).handle(async (ctx) => { … });
export const rename = secured.args<{ name: string }>().handle(async (ctx) => { … });
```

| Method | What it does |
|---|---|
| `.args<T>()` | The type of the arguments the client passes |
| `.form(f)` | The client passes this form; the server validates a fresh copy of it |
| `.use(...mws)` / `.skip(...mws)` / `.skip('*')` | Adds middlewares, or removes inherited ones |
| `.invalidates(...paths)` | Cached page data this call leaves stale |
| `.compress(options \| false)` | Compresses the upload past a threshold |

`load` can be a builder too, and is always a GET:
`export const load = get().use(auth).handle(…)`.

## The chain

Three levels, from the outside in:

```ts
// src/http.ts — every function of the app, `load` included
export default chain().use(log, csrf, errorPages);

// a `@server` — every function of that file
export const http = chain().skip('*').use(apiKey);

// a function — its own builder
export const save = put().use(audit).handle(…);
```

## Middlewares

A plain function runs on both sides. `middleware()` gives one half per side, and what it adds
to `ctx` is typed for whoever comes after:

```ts
export const auth = middleware<{ user: User }>()
  .client((ctx, next) => {
    ctx.headers.set('authorization', `Bearer ${localStorage.getItem('token')}`);
    return next(ctx);
  })
  .server((ctx, next) => {
    const token = ctx.headers.get('authorization')?.slice(7);
    if (!token) throw unauthorized();
    return next(Object.assign(ctx, { user: inject(Tokens).verify(token) }));
  });
```

The server half never ships: the client build erases the argument of every `.server(…)` in a
module that imports `@fudic/http`, and the bundler drops what only it imported.

## Errors

Throw them: `throw notFound()`. `badRequest`, `unauthorized`, `forbidden`, `notFound`,
`conflict` and `redirect(location)` build an `HttpError`; the body is a problem (RFC 9457).
The client receives the same `HttpError`, a `ValidationError` for a 422 — whose errors go
straight to the form — or a `Redirect`.

`errorPages` handles what nobody caught: a redirect navigates, a validation error or an abort
is rethrown, and anything else navigates to `_error.fud` with its status. `_error.fud` is a
page in `src/routes/` with no URL of its own; its `data` is `{ status, title, detail? }`.

## Requests

`inject` and `publish` from `@fudic/di` work without `ctx` anywhere server code runs during a
request: `load`, `layout`, a `handle`, a middleware's server half, and whatever they call.

`csrf` requires a header a foreign page cannot send. A call that is not a GET invalidates the
cached data of the current page and of `.invalidates(…)`, and waits for the Service Worker to
confirm it.

## The upload

A form travels positionally — both ends import the same schema, so the field names add
nothing. When every control is typed (`str`, `u8`, `bool`, …) it travels in binary, and past
the threshold of `.compress(…)` it is compressed. None of this is written by hand.

## Deploying

The build writes `.fudic/edge/functions.mjs`: a `handle(request)` that answers every server
function with a `Response`, and the table of URLs and methods for an adapter to mount.
`vite preview` serves it.
