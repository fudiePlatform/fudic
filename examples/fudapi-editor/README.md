# fudapi-editor

A handful of `.fudapi` files to try the language in VS Code, and the handlers that implement
them. Nothing here builds or runs: it is for the editor only.

```
src/http.fudapi                    the global chain
src/middlewares/auth.fudapi        middlewares (extensions file)
src/rules/forms.fudapi             rules and patterns (extensions file)
src/routes/usuarios.fud            a route…
src/routes/usuarios.fudapi         …and its contract: load, functions, a type
src/components/user-form.fudapi    a form with groups, rules and require
```

Things to try:

- Break a word: `use auht`, `requird`, `number` instead of `i32`. The error offers the closest
  name.
- Type at the start of an indented line, after `use `, after `skip `, after a field name, inside
  a text after `{`, after `require code `.
- Hover over `auth`, `Person`, `min-length`, `email-loose`; Ctrl+click to jump to them.
- Mess up the spacing and save: the file is formatted.
- Delete the `id  uuid` line under `put save /:id` to see what a route parameter without an
  argument says.

## The handlers (`src/server`)

Saving a `.fudapi` writes its types to `.fudic/api/<id>.d.ts`, and `src/server/*.ts` import them
as `fudic:<id>`:

- Open `src/server/usuarios.ts`: `ctx.` completes `params`, `query`, `args` and the `user` that
  `auth` adds.
- Make `buscar` return a string: `satisfies SearchHandler` goes red.
- Add `  -> Person` under `put save` in `usuarios.fudapi` and save: `save.handle` now demands a
  `Person`.
