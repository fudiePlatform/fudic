# @fudic/compiler

Compiler for `.fud` files — the core of **fudic**, a UI framework based on
**Declarative Shadow DOM**.

> Status: initial scaffolding (SDD-00). No compilation logic yet.
> See the roadmap in [`docs/sdd/`](../../docs/sdd/INDEX.md).

## What the view may write

The view fills holes, it does not program. Everything written in `@( … )`, in an
attribute value, in a control header or in an `@{ }` is a closed white list that the
compiler can lower with the same meaning to every backend. Anything else is an error.

- **Values and names**: string, number, `true`, `false`, `null` and `undefined` (the one
  global); the names of the template, the `@code` and `data`.
- **One kind of call**: reading a reactive value with no arguments — a signal, a
  `computed`, a form or one of its controls — and `t("…")` as the value of a prop.
  No `new`, no methods of any prototype (`find`, `join`, `toFixed`…), no `Math`, `JSON`,
  `Date` or `Intl`. A date is painted with a pipe: `@(when | longDate)`.
- **Operators**: `+ - * / %`, `=== !==`, `< <= > >=` (between numbers, texts or dates),
  `&& || !` over booleans, `??`, `? :` and the pipe `|`. Conditions are booleans: write
  `name !== null`, never `@if (name)`.
- **Access**: `a.b`, `a?.b`, `xs[i]`, `map[key]`, `.length` of a list or a text, and
  templates without a tag.
- **Destructuring** of objects, with renames, defaults and `...rest`; and attribute
  spreads (`<app-card ...post>`), written in name order on a native element.
- **`@{ }`** declares with `const`/`let` and reassigns variables; no `if`, loops or calls.
- **Handlers and callbacks** (`@click=@(…)`, a prop whose value is a function) are plain
  TypeScript and are not checked: they only ever run in the browser.

### Collections

Five pieces cover any calculation over a list, and each has a direct equivalent in every
backend: `filter`, `map`, `reduce` (always with an initial value), `toSorted` and
`.length`, each with a one-expression arrow.

| Need | Written |
|---|---|
| Count matching | `tasks().filter(t => t.done).length` |
| Any? / all? | `xs.filter(x => x.ok).length > 0` · `xs.filter(x => !x.ok).length === 0` |
| First matching | `xs.filter(x => x.id === id)[0]` |
| Sum | `lines.reduce((s, l) => s + l.price * l.qty, 0)` |
| Join text | ``authors.reduce((s, a, i) => i === 0 ? a.name : `${s}, ${a.name}`, "")`` |
| Sort | `xs.toSorted((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0)` |

### `@empty`

"Nothing to show" is said with `@empty`, right after the body of `@foreach`, `@for` or
`@while`. It is painted when the loop makes no turn, and swapped in and out live:

```
@foreach (const post of data.posts) key (post.slug) {
  <app-card .title=@post.title></app-card>
} @empty {
  <p>No posts yet.</p>
}
```

### What the server evaluates of the `@code`

What the view reads of the `@code` follows the same list: `props<T>()`, `signal(v)`,
`computed(() => e)`, a `const` of the list, a literal of data typed with a named type, a
store of the project or a module of data. The current instant is `signal(now())`, from
`@fudic/core`. `examples/basic/src/routes/vista.fud` is the catalog of what is allowed,
and `examples/vista-errores` shows each error with the code it gives.

## Scripts

```sh
pnpm typecheck    # strict type-check
pnpm test         # run the test suite (Vitest)
pnpm coverage     # tests with coverage
pnpm build        # emit to ./dist
```

## Toolchain

| Tool | Version |
|---|---|
| TypeScript | 5.9.3 |
| Vite | 8.0.16 |
| Vitest | 4.1.9 |
| oxc-parser | 0.137.0 |

Versions are pinned **exactly** (no `^`/`~`) for reproducibility. See
[SDD-00](../../docs/sdd/SDD-00-toolchain.md).

## License

[MIT](../../LICENSE)
