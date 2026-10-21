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
