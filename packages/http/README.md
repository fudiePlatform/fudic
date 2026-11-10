# @fudic/http

Server functions for fudic. Declare a function in the `.fudapi` of a route or a component,
write its handler in `src/server`, and call it by name from the `@code` — no URLs, no headers,
no `fetch`, and the types cross on their own.

```
# src/routes/users.fudapi
get search
  q  str
  -> User[]

put save
  use auth
  form userForm
  -> User
```

```ts
// src/server/users.ts
import { inject } from '@fudic/di';
import { search, save } from 'fudic:routes/users';
import { Users } from '../services/users';

search.handle((ctx) => inject(Users).find(ctx.args.q));
save.handle((ctx) => inject(Users).save(ctx.user, ctx.form.$value()));
```

```html
<link rel="server" href="./users.fudapi">

@code {
  async function find(e: Event) {
    found.set(await search({ q: (e.target as HTMLInputElement).value }));
  }
}

<input @input=@find>
<form control=@userForm form:=@save> … </form>
```

fudic generates the `fudic:routes/users` module from the `.fudapi`. The handlers never reach
the browser: there, `search` takes the arguments and an optional `{ signal }`, and returns a
promise of what the handler returned. A function with no handler answers `404`; in dev, its
`detail` says what is missing.

## What is public

`@fudic/http` keeps what a handler throws (`HttpError`, `notFound`, `conflict`…), the types of
the `ctx` it receives (`ServerContext`, `ClientContext`…), `Problem` and `ErrorPage`, and what
the compiler links (`./client`, `./server`). The builders — `get`, `post`, `put`, `patch`,
`del`, `chain`, `middleware`, `SharedMiddleware`, `csrf`, `errorPages` — are gone: their place
is the `.fudapi`, and what fudic generates of it imports `@fudic/http/contract`, an internal
entry.

| Before | Now, in a `.fudapi` |
|---|---|
| `get().args<{ q: string }>()` | `get search` with `q  str` below it |
| `.form(f)` | `form f` |
| `.use(auth)` / `.skip(log)` / `.skip('*')` | `use auth` / `skip log` / `skip *` |
| `.invalidates('/users')` | `invalidates /users` |
| `.compress({ … })` / `.compress(false)` | `compress gzip 200` / `compress off` |
| `export const http = chain()…` | `chain`, once per file |
| `src/http.ts` | `src/http.fudapi` |
| `middleware<{ user: User }>()` | `middleware auth` with `client`, `server` and `adds` |

## Functions

```
put save /:id           # get | post | put | patch | delete, and an optional route
  use auth
  id  uuid              # in the URL: the route names it
  query notify  bool    # in the query string
  active  bool          # in the body (in the query of a `get`)
  fails taken 409 "That name is taken."
  -> User               # without it, the function returns nothing (204)
```

Each argument travels where its declaration says: a `:x` of the route in the URL
(`ctx.params`), a `query` argument in the query string (`ctx.query`), the rest in the body
(`ctx.args`), a `form` in the body (`ctx.form`). The browser still makes one call —
`save({ id, notify, active })` — and both ends check each value against its type: a number out
of its width or a malformed `uuid` is refused with a `400` on the server, and refused without
sending in the browser.

An `html` value crosses as text, never as trusted markup: a `TrustedHTML` the server hands over
arrives as its text, in the server's own render and in the browser alike, so `@raw` escapes it on
both sides. What a `load` returns is data, and that holds at any depth of it.

An argument takes rules below it, as a form field does: `required`, `min`, `max`,
`min-length`, `max-length` and `pattern`, with the same meaning, since the code is the same. The
browser checks them before anything leaves, and the server again before the chain: the first
that fails is a `400` whose `detail` is the rule's text, or `argument name: max-length 80`.

```
put save /:id
  name  str
    required
    max-length 80
  age   u8
    min 18  "Too young."
```

The rules of the project are written for a form and are not allowed here: check that in the
handler.

`load` is declared the same way, and is always a GET:

```
load ssr ttl 5m cache-first
  use auth
  users  User[]
```

A function carries its verb as `method` (`save.method === 'PUT'`), which is what `task` of
`@fudic/core` reads to pick its order: `task(save)` queues its calls, `task(search)` keeps the
last one.

**The page repaints after a call.** A call that changes something invalidates the page it was
made from, and the paths of its `invalidates`. When the current page is among them, the browser
asks the server for its `data` again — `load` runs on the server, never in the browser — and the
page repaints with it, keyed rows kept, scroll and focus where they were. The call resolves
after the repaint, so the code after the `await` sees the page up to date. There is no
`location.reload()` to write. If the refresh fails (the network, a `load` under `use auth`
answering 401), the document reloads and the server paints what its rule says. Only the route's
`data` is refreshed; what the layout shows changes on the next navigation.

## The chain

Three levels, from the outside in:

```
# src/http.fudapi — every function of the app, `load` included
chain
  use log
  use error-pages
    routes  401 /login
  use csrf

# any other .fudapi — every function of that file
chain
  skip *
  use api-key

# a function — its own clauses
put save
  use audit
```

## Middlewares

A middleware is declared with its halves, its parameters and what it adds to `ctx`:

```
middleware auth
  server
  adds
    user  User
```

Each half is implemented in its folder — `client` in `src/browser`, `server` in `src/server` —
and `adds` types the `ctx` of every handler that uses it. A middleware with only a server half,
like this one, asks nothing of the browser:

```ts
// src/server/auth.ts
import { inject } from '@fudic/di';
import { unauthorized } from '@fudic/http';
import { auth } from 'fudic:middlewares/auth';
auth.server((ctx, next) => {
  const session = ctx.cookies.get('sid');
  if (session === undefined) throw unauthorized();
  return next(Object.assign(ctx, { user: inject(Sessions).verify(session) }));
});
```

`src/server` never reaches the browser. A server half in `src/browser`, a client half in
`src/server`, or two implementations of the same piece stop the build, with the paths.

`csrf` and `error-pages` are declared in this package's `fudapi/` and implemented in its
`browser/` and `server/`: installing `@fudic/http` makes them visible to every `.fudapi` of the
app. So is `json`, which has no halves: it is a mark the compiler reads (see below).

## Remote rules

A rule of a `.fudapi` declared `runs remote` has a route, and only such a rule: a `runs server`
one answers 404, so exposing a check is a decision written in the contract.

```
POST /_fudic/rule/<id>/<name>
```

The browser sends the value the rule watches and the parameters of that use — never the whole
form — in the rule's format: `fud-bin` with its `fud-sig` by default, JSON with `use json`
(`{ "value": "pedro", "params": {} }` → `{ "ok": true }` or `{ "ok": false, "fails": "alias-taken" }`).
In front of the check run the signature (412), the shape of the value and of the parameters
(400), the `$global` chain and the rule's own `use`; an error travels as a problem in the rule's
format. The question walks the client halves of that chain too, as a function's call does, so it
carries the `csrf` header; and since it is answered with the response as it came, `error-pages`
never takes the page away for a question.

Its own `use` run around the check on the submit as well (`withForm`; `$global` already ran
around the function there), and the check reads what they add: `emailTaken.check(async (value, _params, ctx) => !(await inUse(value, ctx.user.id)))`
after `use auth`. Mind what a remote rule tells: an endpoint that answers «is this email taken?»
tells anyone who is registered. If that matters, put a middleware on it.

## Session

The browser only talks to the app's own server, so the session lives in an `HttpOnly` cookie:
the browser sends it on every call, and no script of the page can read it. A server function
sets it and removes it; the browser writes nothing.

```ts
// src/server/usuarios.ts
import { deleteCookie, setCookie } from '@fudic/http';
import { login, logout } from 'fudic:routes/usuarios';

login.handle((ctx) => {
  setCookie(ctx, 'sid', ctx.args.user);
});

logout.handle((ctx) => {
  deleteCookie(ctx, 'sid');
});
```

`setCookie` writes `Path=/; HttpOnly; Secure; SameSite=Lax` unless told otherwise. Whether
`Secure` goes is the server's to say (`secureCookies` of `@fudic/server`, `true` unless said),
never the `Host` of the request: dev and preview over `http` leave it out, a deployed server
puts it. A `__Host-` name always goes with `Secure` and `Path=/`, and with a `domain` or another
`path` it is a `TypeError`; a `__Secure-` one always with `Secure`. `deleteCookie` repeats
`Secure` where the cookie had it, or the browser would not remove it. It throws a `TypeError` on
what a browser would drop without a word: a name that is not an HTTP token, and
`sameSite: 'none'` or `partitioned` without `secure`. `serializeCookie` gives the same text
without a `ctx`. Reading is `ctx.cookies.get(name)`.

A `load` writes its cookies, status and headers the same way, and they reach the browser with
the page and with its data, also when it throws: a `deleteCookie` before `throw unauthorized()`
arrives. fudic keeps its own `Content-Type` and CSP.

What reads the session — `ctx.cookies`, or the `cookie` or `authorization` header — goes out
`Cache-Control: private, no-store` unless the handler set its own. The Service Worker never keeps
a `no-store` or `private` answer, so what Ana saw is never what Luis gets, and signing in or out
needs no invalidation. A prerendered page that reads the session is `FUD1300`: a page for nobody,
served to everyone — write `load ssr`.

A client half that puts a token in `authorization` still works; the cookie is the way that needs
no code in the browser.

## Errors

Throw them: `throw notFound()`. `badRequest`, `unauthorized`, `forbidden`, `notFound`,
`conflict` and `redirect(location)` build an `HttpError`; the body is a problem (RFC 9457).
A `fails` of the declaration is generated as a function: `throw SaveFails.taken()`. The client
receives the same `HttpError`, a `ValidationError` for a 422, or a `Redirect`. A form sent with
`form:=@save` keeps the statuses its `catches` names — 400, 409 and 422 unless it says
otherwise — and paints them itself.

`error-pages` handles what nobody caught: a redirect navigates, an abort, a 422 or a status
the form keeps is rethrown, and anything else navigates to `_error.fud` with its status and
the server's `detail`. Its `routes` send a status somewhere else.

`_error.fud` is a page in `src/routes/` with no URL of its own. Its `data` is the `ErrorPage`
of `@fudic/http`: `{ status, title, detail? }`.

## Requests

`inject` and `publish` from `@fudic/di` work without `ctx` anywhere server code runs during a
request: `load`, `layout`, a handler, a middleware's server half, and whatever they call.

`csrf` requires a header a foreign page cannot send, and refuses a `Sec-Fetch-Site` that is not
`same-origin` or an `Origin` that is not the app's public one. Written with `token true` under
it, it also wants a token signed against an `HttpOnly` cookie (signed double submit): the
browser half fetches it from `GET {base}_fudic/csrf` the first time a call needs it, sends it in
`x-fudic-csrf`, and fetches it again once on a `403` with the code `csrfToken`. The server signs
with its `secret` (`FUDIC_SECRET`). A call that is not a GET invalidates the cached data of the
current page and of `invalidates`, and waits for the Service Worker to confirm it.

## Files

`file`, `file?` and `file[]` in a `.fudapi` are the platform's `File`. A function whose arguments
can hold one always travels as `multipart/form-data`: first the part `$args`, the other arguments
in the function's own format, then each file named by its path in the arguments (`avatar`,
`docs.0`, `doc.attachment`). Nothing of a file is in `$args`, not even its null bit. A call
without files is byte for byte what it was.

In the browser such a call goes out through `XMLHttpRequest`, the one API that reports the
progress of an upload in every engine; anything else through `fetch`. `onProgress` of the call
options, `progress()` of a `task` and `$progress()` of a form give `{ loaded, total, phase }`,
the upload and then the download, and `null` once it moves no more. The browser reads each file
from the disk as it sends it.

The server reads the body as it arrives, with its own multipart reader: `$args` first (else
`400`), each file into the `Spool` the server was given (`memorySpool` by default, `diskSpool` of
`@fudic/server/node` on Node), counting bytes against the field's `max-size` or `maxFileSize`.
Past a limit (`UploadLimits`: 10 MB a file, 20 files, 1 MB of `$args` unless `serve.uploads` in
`fudic.json` says otherwise) it stops reading and answers `413`, naming the limit and the field.
A part whose name is no file of the arguments is a `400 multipart body:`. What the spool kept
goes once the response is done or cancelled. A multipart call from another site is a `403`,
with `csrf` in the chain or not: a `<form>` of another page can send multipart.

`-> file` answers with the file as the body: its `content-type`, `content-disposition: inline`
with its name, `content-length` and `last-modified`; `undefined` from a `-> file?` is a `204`. A
value that holds files comes back as multipart, `$value` and a part per file, and the client
puts it back together.

Every `get` has `url(args)`: the URL that calls it, base, route, query, `?a=` and its signature
in `$sig` included, for a `href` or a `src` the browser asks with no script. The server takes the
signature from the query only for a `get`.

## On the wire

Every call travels in binary: its arguments, its value and its problem. Both ends hold the
same contract, so names and types stay home and only the values travel — a `bool` is a bit, a
`uuid` 16 bytes, a `date` 6 bytes that come back a `Date`. Route and `query` arguments stay in
the URL as text; the body is `application/fud+bin`, a failure `application/problem+fud`, and
the arguments of a `get` go in `?a=` as base64url. A value that does not fit its type is
refused by the side that writes it, never sent in another format. Past the threshold of
`compress` the body is compressed.

For a client that is not a fudic page, `use json` switches a function to JSON with its keys
(`application/json`, `application/problem+json`). It is a middleware like any other: put it in a
`chain` and `skip json` where binary is wanted. Each function speaks exactly one format, decided
by the compiler; a body in the other one is a `415`.

Every binary function carries a signature of its types in the `fud-sig` header. A page that the
Service Worker kept from before a deploy, calling a function whose types changed, gets a `412`
("the page is older than the server") instead of bytes the server would misread; `error-pages`
takes it to the error page like any other status. Rules and comments do not change it.

The format is written down byte by byte with test vectors in `wire/vectors.json`: a backend in
another language that writes and reads all of them speaks it. `signature` and the codecs live in
`@fudic/http/wire`, `/wire/bin` and `/wire/json`.

In a test whose `fetch` answers by hand, `respond(fn, value)` and `respondProblem(fn, problem)`
of `@fudic/testing` write the response in the function's own format.

## Deploying

The build writes `.fudic/edge/functions.mjs`: a `handle(request)` that answers every server
function with a `Response`, and the table of URLs and methods for an adapter to mount. It
carries sourcemaps, so an error in a handler points at its `.ts`. The whole app, pages
included, is `.fudic/edge/server.mjs`, which `@fudic/server` serves: that is what `vite preview`
and any adapter mount.
