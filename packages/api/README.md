# `@fudic/api`

The `.fudapi` language: the server of a route or a component, declared next to it.

```
src/routes/users.fud          the view, and one @code that runs in the browser
src/routes/users.fudapi       the contract: load, functions, types
src/server/users.ts           the handlers, joined with `.handle`
```

A `.fudapi` only declares: functions, `load`, `paths`, `layout`, types, enums, forms, rules,
middlewares, patterns, messages and the chain. It never holds code. fudic generates the
`fudic:<id>` module from it, and the code you write imports that module.

This package is the language itself and depends only on `@fudic/diagnostics`: no compiler, no
Oxc.

## Fields that arrive later

A field of `load` can end with `later`: its handler returns a promise for it, unawaited, and
the page goes out without waiting for it. The view paints it inside `@await data.<field>`.

```
load ssr
  title  str
  users  Person[]  later
```

```ts
load.handle(async () => ({ title: 'Users', users: db.listUsers() }));
```

The generated type is `readonly users: Promise<readonly Person[]>`. `later` only applies to the
fields of `load`; anywhere else it is `FUD1324`.

## What it exports

```ts
API_EXTENSION                                     // '.fudapi'
parseApi(source)                                  // ParseResult<ApiFile>: never throws
formatApi(source)                                 // the formatted text; untouched with an open quote
createApiIndex(sources)                           // the project's names: app and direct dependencies
validateApi(source, index, ctx)                   // the diagnostics of one file against the index
emitDeclarations(source, index, ctx)              // the `.d.ts` of `fudic:<id>`
emitModule(source, index, ctx, 'server' | 'browser')  // the virtual module, one per side
```

`ApiFile` is the tree, with a `Span` on every node and the documentation of every declaration
(the `#` lines right above it). `ctx` is what the host knows: whether the file is the sibling of
a route, its parameters and the props of its layout. The same index and the same file give the
same bytes, and none of these functions throws.

## Who uses it

- `@fudic/vite` indexes the `.fudapi` of `src/**` and the `fudapi/` folder of each direct
  dependency, serves `fudic:<id>`, writes `.fudic/api/<id>.d.ts`, and dispatches
  `/_fudic/fn/<id>/<name>` to the handlers registered by `src/server`.
- `@fudic/language-server` gives a `.fudapi` its diagnostics, completion, hover, definition,
  semantic tokens and formatting, and writes the `.d.ts` on save.
- `@fudic/typecheck` reads the `.fudapi` a `.fud` links with `<link rel="server">`, for the
  names its view and its `@code` see.
- `@fudic/cli` formats it with `fudic fmt`.

The language is specified in [SDD-60](../../docs/sdd/SDD-60-fudapi.md).

## Scripts

```sh
pnpm --filter @fudic/api test
pnpm --filter @fudic/api typecheck
pnpm --filter @fudic/api coverage
```
