# 01-usuarios

The real `/usuarios` of `examples/basic`, as contracts: a route and a component, each in one
`server.ts` with its types and its form; two middlewares apart.

## Exercises

- A route contract (`load` with options, GET/PUT/DELETE) and a component contract (PUT with a form).
- Interface first, its types and form below in the same file.
- Middlewares by `typeof` through `import type`; one adds `{ user: { id; name } }`, the other nothing.
- Widths (`i32`, `u8`), `readonly` arrays.
- `invalidates` as a tuple of literal types.
- The form of today, `serverValidator` and `pattern` included.

## Expected issues

- error `server-code-in-form` on `serverValidator(…)`.
- note `regex-dialect` on `pattern(…)`.

Nothing else.

## In the editor

The `.fud` files are `examples/basic`'s with the `@server` swapped for `<link rel="server">`,
kept inside a `@* … *@` comment because today's compiler does not know it (as markup it would
be FUD0155/FUD0156 in the component and FUD0421 in the route). The extractor reads it anyway.
What remains in the editor is what the link should bring: `data` is `unknown` and `search`,
`save`, `remove`… are unknown names. That goes away only when the compiler learns the link.
