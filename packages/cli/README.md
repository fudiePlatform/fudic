# @fudic/cli

Scaffolding for fudic apps: it creates projects and adds pieces (pages, components,
layouts) to an existing one. **It is not a bundler, a dev server or a watcher** — that is
Vite with `@fudic/vite`. The analogy is `ng generate`, not `vite`.

```sh
fudic new demo                                  # a project that builds
fudic g component app-card --in routes/index.fud # a component, already wired
fudic g page blog/:slug                          # a route under its layout
fudic g layout admin --sections aside
```

## Why it exists

The right scaffolding for a `.fud` is not obvious: the top-level order is strict
(decision 53 for components, 83 for routes), a custom element needs a hyphen
(decision 41), `<link rel="component">` goes in a different place depending on the
document's role (decisions 59 / 83), and a page under a layout should declare the sections
its layout renders. Those are all errors you discover by compiling. This CLI makes them
impossible by construction.

It is also the **first external consumer of the compiler's API** — parsing, querying by
offset, editing by span. If that API cannot place a `<link rel="component">` at the right
offset of someone else's file, it will not carry a language server either.

## Design

Every command is `plan → apply`:

```ts
import { planComponent, apply } from '@fudic/cli';

const plan = await planComponent('app-card', { cwd: '.', force: false, dir: 'components', wireInto: [], style: true, slot: false });
await apply(plan, { cwd: '.', force: false });
```

`plan*` reads the disk and never writes; `apply` is the only writer. That is what makes
`--dry-run` exact — it is literally the plan without `apply` — and every command testable
without a filesystem.

Exit codes: `0` success · `1` usage error or collision · `2` a compiler diagnostic on a
file the CLI was asked to modify.

## Rules it never breaks

- **No interactivity.** No prompts, no menus, no confirmations. A CLI that asks cannot go
  into a script, or CI, or a test.
- **No regular expressions over `.fud`.** Every read of a foreign file goes through
  `@fudic/compiler`.
- **No throwing.** Errors are diagnostics with spans and exit codes. A Node stack trace in
  the terminal is a bug in this package.
- **Spans are preserved.** Wiring inserts at an exact offset: it does not reformat, does
  not reorder attributes, does not touch a line it did not add.

See `docs/sdd/SDD-22-fudic-cli.md`.
