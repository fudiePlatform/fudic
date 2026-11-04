# fudapi

The `.fudapi` language: the server contract of a route or a component, what fudic generates from it and what you write.

## Three files per piece

- `src/routes/people.fud`: the view. It links its contract with `<link rel="server" href="./people.fudapi">`.
- `src/routes/people.fudapi`: the contract (`load`, functions, types, forms). It only declares; it never holds code.
- `src/server/routes/people.ts`: the handlers, joined with `.handle(...)`, anywhere under
  `src/server` (which never reaches the browser). fudic is a BFF: a handler translates between
  the contract and your backend; it never is the backend. Browser halves go in `src/browser`.
- From `src/<id>.fudapi` fudic generates the module `fudic:<id>` (`fudic:routes/people`,
  `fudic:routes/blog/[slug]`) and its types in `.fudic/api/<id>.d.ts`; never edit them.
- A function with no handler answers `404` (in dev, `detail` says what is missing). A piece
  implemented twice or in the wrong folder stops the build; a wrong signature is a TS error.

`fudic_generate { kind: "api" }` on an existing route or component writes the `.fudapi` (a
`load` with `title  str` for a route, `get hello  -> str` for a component), its handler in
`src/server/<id>.ts`, the `<link rel="server">` in the `.fud`, and adds `@fudic/http` to the
project. `fudic_contract { id: "routes/people" }` lists what a contract asks you to implement.

## The syntax

- One declaration per line, clauses below, **2 spaces** per level (never tabs). `#` comments;
  `#` lines right above a declaration document it. Strings: double quotes, one line.
- Functions, fields, arguments and forms are identifiers (`searchJson`); `type` and `enum` are
  PascalCase; rules, middlewares, patterns and `fails` codes are kebab-case (`email-taken`,
  `emailTaken` in TypeScript).
- `type`, `enum`, `form`, `rule`, `middleware`, `pattern` and `messages` belong to the project:
  every `.fudapi` sees them without imports. Declared twice is `FUD1081`; unknown, `FUD1080`.
  Functions, `load`, `paths`, `layout` and `chain` belong to their file.
- A file is a contract (`load`, `paths`, `layout`, functions, `chain`, `form`, `type`, `enum`,
  `messages`) or extensions (`rule`, `middleware`, `pattern` and the types they use); mixing is
  `FUD1078`.

## Types

| Write | TypeScript |
|---|---|
| `str`, `bool` | `string`, `boolean` |
| `u8 i8 u16 i16 u32 i32 f32 f64` | `number`, checked against its width |
| `date` / `uuid` / `html` | `Date` / `string` checked as a UUID / `TrustedHTML` crossing as text |
| `T[]` / `T?` | `readonly T[]` / an optional field |
| `map K V` (`K`: `str`, `uuid` or an integer) | `Readonly<Record<K, V>>` |
| a `type` or `enum` name | its interface or union of literals |

`number` does not exist (`FUD1080`). An empty `type` or `enum` is `FUD1073`. Values are checked
on both ends: a bad one is a `400` on the server and is refused in the browser before sending.

## A contract

```fudapi path=src/routes/people.fudapi
# Per request: the list changes with every new person.
load ssr
  people  Person[]

# Public. A longer text is refused in the browser, before it leaves.
get search
  q  str
    min-length 2
    max-length 80  "Search with 80 characters at most."
  -> Person[]

# Turns a person on or off. The id travels in the URL, notify in the query string.
put save /:id
  use auth
  catches 409
  fails locked 409 "An admin cannot be turned off."
  query notify  bool
  id      i32
  active  bool

# Removes a person. A 409 here is not caught: error-pages takes the page to _error.fud.
delete remove /:id
  use auth
  id  i32

# Signs a person up with personForm, which keeps its 400, 409 and 422 and paints them.
post create
  use auth
  form personForm
  fails reserved 409 "That name is reserved."
  invalidates /people
  -> Person

type Person
  id      i32
  name    str
  email   str
  age     u8
  active  bool
  role    Role

enum Role
  admin
  member
```

```fud path=src/routes/people.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./people.fudapi">

<h1>People</h1>
<ul>
  @foreach (const p of data.people) key (p.id) {
    <li>@p.name</li>
  }
</ul>
```

A function is `get`, `post`, `put`, `patch` or `delete`, a name, and an optional route (`/:id`,
`/:id/lines/:line`). Its lines, in any order:

| Line | Meaning |
|---|---|
| `<arg>  <type>` | an argument: in the URL when the route names it (`ctx.params`), else in the body (`ctx.args`; the query string for a `get`) |
| `query <arg>  <type>` | an argument in the query string (`ctx.query`) |
| `form <form>` | the body is that form (`ctx.form`); together with body arguments, `FUD1072` |
| `-> <type>` | what it returns; without it, nothing (`204`) |
| `use <mw>+` / `skip <mw>+` / `skip *` | middlewares, below |
| `catches <status>+` | these statuses reach the caller instead of `error-pages` |
| `fails <code> <status> "<text>"` | a named failure the handler throws |
| `invalidates <path>+` | pages whose data is stale after the call; the current one among them repaints |
| `compress <format> [<min>]` / `compress off` | body compression past `<min>` bytes: `gzip`, `deflate`, `deflate-raw` |

- Route and query arguments are scalars (`FUD1101`); a `:x` with no argument `x` is `FUD1099`.
  The browser makes one call, `save({ id, notify, active })`; with only a form, `create(form)`.
- Rules under an argument: `required`, `min`, `max`, `min-length`, `max-length`, `pattern`, each
  with an optional text. They are the rules of `@fudic/forms`: a project without it gives
  `FUD1080` (unknown rule) until it is added with `fudic_add { module: "forms" }`. Checked in the browser before sending and on the server again: a `400`
  whose `detail` is the text. Project rules are for forms only: check the rest in the handler.
- `load`, `paths` and `layout` go only in the `.fudapi` beside a route (`FUD1090`): topic pages.

## What you write: handlers

```ts path=src/server/routes/people.ts
import { conflict, notFound } from '@fudic/http';
import { create, CreateFails, load, remove, save, SaveFails, search, type Person, type SearchHandler } from 'fudic:routes/people';

let people: readonly Person[] = [
  { id: 1, name: 'Ana', email: 'ana@example.com', age: 34, active: true, role: 'admin' },
  { id: 2, name: 'Luis', email: 'luis@example.com', age: 29, active: true, role: 'member' },
];

export const find = ((ctx) => people.filter((p) => p.name.includes(ctx.args.q))) satisfies SearchHandler;

load.handle(() => ({ people }));
search.handle(find);

save.handle((ctx) => {
  const person = people.find((p) => p.id === ctx.params.id);
  if (person === undefined) throw notFound(`Nobody has the id ${String(ctx.params.id)}.`);
  if (person.role === 'admin' && !ctx.args.active) throw SaveFails.locked();
  people = people.map((p) => (p.id === person.id ? { ...p, active: ctx.args.active } : p));
  if (ctx.query.notify) console.info(`[people] ${ctx.user.name} changed ${person.name}`);
});

remove.handle((ctx) => {
  if (people.some((p) => p.id === ctx.params.id && p.role === 'admin')) throw conflict('An admin cannot be removed.');
  people = people.filter((p) => p.id !== ctx.params.id);
});

create.handle((ctx) => {
  const value = ctx.form.$value();
  if (value.name.trim().toLowerCase() === 'admin') throw CreateFails.reserved();
  const person: Person = { id: people.length + 1, name: value.name, email: value.email, age: value.age, active: true, role: 'member' };
  people = [...people, person];
  return person;
});
```

- Each declaration is exported "up to `.handle`": `x.handle(fn)` registers the handler and
  returns nothing. `<Name>Handler` is its type, `<Name>Fails` its `fails`.
- `ctx` is typed from the declaration: `params` (the page's parameters and the function's
  route), `query`, `args` or `form`, what each `use`d middleware `adds` (`ctx.user`), and
  `cookies`, `headers`, `url`, `signal`, `response` (`status`, `headers`).
- To fail, throw `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict` (each with
  an optional `detail`) or `redirect(location)` of `@fudic/http`, or a declared failure,
  `SaveFails.locked()`. The body is a problem (RFC 9457).
- A `fails` sends its status and code (and its source text as `detail`, for a client that is
  not a page); a fudic page shows the `.fudapi` text in its own language. Without `catches` an
  error goes to `error-pages`; with it, to the caller: `task(save).message()` (topic pages).
  `inject` and `publish` of `@fudic/di` work in any handler without `ctx`.

## Forms

```fudapi path=src/forms/person.fudapi
# The sign-up form: validated in the browser, and again on the server before the handler.
form personForm
  validate-on blur input
  name  str = ""
    required             "Write the name."
  email  str = ""
    required             "Write the email."
    pattern email-loose  "That email does not look right."
    email-taken          "Somebody already uses that email."
  age  u8
    required             "Write the age."
    min 18               "At least {n} years."
  password  str = ""
    min-length 8         "At least {n} characters."
  repeat  str = ""
    required             "Repeat the password."

  summary
    require mismatch  password == repeat  "The passwords do not match."
```

- A field is `<name>  <type> [= <initial>]` with its rules below; `<name>  group` nests fields.
  Without `= value` it starts `""`, `false`, `null` or `[]`. `required` makes the validated value
  non-null: `ctx.form.$value().age` is a `number`.
- Built-in rules: `required`, `min n`, `max n`, `min-length n`, `max-length n`, `pattern <name>`,
  from `@fudic/forms` (`fudic_generate { kind: "form" }` adds it). Texts are templates (`{n}` is the parameter). A rule not for the field's type is `FUD1083`.
- `summary` holds the form's own rules: `require <code> <expression> "<text>"` with field paths
  (`access.key`), literals, `== != < <= > >=`, `and or not`, `contains`, `valid f`, `empty f`,
  `length f` and parentheses, run on both sides; `when <expression>` groups `require`s. Options:
  `validate-on submit|blur|input`, `validity rules|interacted`, `catches` (default 400 409 422).
- A form reaches the view of every `.fud` that links a `.fudapi` whose function uses it, by its
  name: `<form control=@personForm form:=@create>`. Binding it is the topic view.

## Rules and patterns

```fudapi path=src/rules/people.fudapi
# The email belongs to somebody already. Only on the server: it reads the people table.
rule email-taken
  on field str
  runs server
  async
  fails email-taken

# Something, an at sign, something, a dot and something.
pattern email-loose  [^@\s]+@[^@\s]+\.[^@\s]+
```

```ts path=src/server/rules.ts
import { emailTaken } from 'fudic:rules/people';
const taken = new Set(['ana@example.com']);
emailTaken.check(async (value) => !taken.has(value));
```

- `on field <type>+` (`*` any type, `*[]` any list), `on group` or `on form`; parameters as
  `<name>  <type>` lines; one or more `fails <code> [<param>]+`. `runs server`: `.check` goes in
  `src/server`; `runs both`: in `src/browser`, run on both sides. `.check` returns `true` for a
  valid value (with several `fails`, `true` or the failing code).
- `pattern <name>  <regex>`: the rest of the line (`#` too), matched whole; `""` passes. `email` is built in.

## Middlewares and the chain

```fudapi path=src/middlewares/auth.fudapi
# Who is calling. The session travels in a cookie the browser sends on its own: no client half.
middleware auth
  server
  adds
    user  User

type User
  name  str
```

```ts path=src/server/auth.ts
import { unauthorized } from '@fudic/http';
import { auth } from 'fudic:middlewares/auth';

auth.server((ctx, next) => {
  const session = ctx.cookies.get('sid');
  if (session === undefined || session === '') throw unauthorized('no session');
  return next(Object.assign(ctx, { user: { name: session } }));
});
```

```fudapi path=src/http.fudapi
# The global chain: every function of the app walks it, load included.
chain
  use csrf
  use error-pages
    routes  401 /
```

- A middleware has `client` (`.client` in `src/browser`), `server` (`.server` in `src/server`)
  or both; parameters as `<name>  <type>` lines; `adds` types the `ctx` of every handler that
  uses it; `fails` as in a function. A half calls `next(ctx)` to go on.
- Three levels, outside in: `chain` in `src/http.fudapi` (the app), `chain` in another contract
  file (that file), `use` / `skip` on a function. One `chain` per file. `skip x` of a middleware
  the function does not inherit is `FUD1086`. Parameters go in lines under the `use`
  (`FUD1087`): `routes  401 /` sends a 401 to `/`.
- Built in with `@fudic/http`: `csrf` (refuses a call another site's page makes with the user's
  cookies), `error-pages` (an error nobody caught goes to `_error.fud`, or to its `routes`) and
  `json`. `fudic add http` writes a `src/http.fudapi` with `use csrf`.
- Calls travel in binary. `use json` makes a function speak JSON (`application/json`) for a
  client that is not a fudic page; in a `chain`, `skip json` where binary is wanted.

## A component's functions

```fudapi path=src/components/app-hello.fudapi
# The server functions of the component: their handlers are in src/server/components/app-hello.ts.
get hello
  -> str
```

```ts path=src/server/components/app-hello.ts
import { hello } from 'fudic:components/app-hello';
hello.handle(() => 'Hello from the server');
```

- `<link rel="server" href="./app-hello.fudapi">` goes at the top of the component or route,
  before `@code`; several are allowed. A missing file is `FUD1111`; in a layout or a snippet,
  `FUD1112`. A component cannot link a file with `load`, `paths` or `layout` (`FUD1114`), nor a
  route another route's `load` (`FUD1115`). `@server` / `@client` in `@code` is `FUD1110`.
- A link brings to `@code` and the view, unimported: `data` (a route's `load`), each function by
  name (`await hello()`, `task(hello)`) and the forms. Types are imported: `import type { Person }
  from "fudic:routes/people"`.

## Pipes

```fudapi path=src/pipes/truncate.fudapi
# Cuts a text at `max` characters.
pipe truncate
  on str
  max u32
```

```ts path=src/pipes/truncate.ts
import { truncate } from 'fudic:pipes/truncate';
export default truncate.implement((value, { max }) => (value.length <= max ? value : `${value.slice(0, max)}…`));
```

A pipe formats a value as text and lives in `src/pipes`. `on` names the type or types it takes
(without it, `FUD1340`); the lines below are its parameters. A view imports the `.ts`, fixes the
parameters in `@code` (`const short = truncate({ max: 40 });`) and writes `@(post.summary | short)`.

## Messages and translation

```fudapi path=src/forms/messages.fudapi
# The texts of the project, by error code.
messages
  required  "This field is required."
```

One `messages` per project (`FUD1096`), a `<code>  "<text>"` per line. With several locales,
`fudic translate` extracts the `.fudapi` texts under form fields, of `require`, of `range` and
of every `fails`, keyed by place (`personForm.age.min`, `save.locked`), and each locale's module
carries its own. A `messages` block is not extracted: write the texts under each field.

```fudapi broken=FUD1360 path=src/routes/people.fudapi
load ssr
  fails missing 404 "Nobody here."
  people  Person[]
```

`fails` never goes under `load`: throw from its handler. Check a contract with `fudic_check`;
`fudic_symbols` and `fudic_describe` say what a name is. Topics: pages, view, components, testing.
