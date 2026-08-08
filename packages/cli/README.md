# @fudic/cli

Scaffolding for fudic apps: it creates projects and adds pieces (pages, components,
layouts) to an existing one. **It is not a bundler, a dev server or a watcher** — that is
Vite with `@fudic/vite`. The analogy is `ng generate`, not `vite`.

```sh
fudic new demo                                       # a project that builds
fudic g component app-card --in src/routes/index.fud # a component, already wired
fudic g page blog/:slug                              # a route under its layout
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

## Manual testing without publishing to npm

None of the `@fudic/*` packages is published yet, so a generated project cannot resolve
them from the registry. This is the loop that lets anyone drive the real binary from
anywhere on their machine, with no registry and no tarballs. It is the same code the tests
exercise, resolved the way a user's install resolves it.

**1. Build and link the CLI globally.** The link points at this working copy, so a later
`pnpm build` is picked up with no re-link.

```sh
cd <repo>
pnpm build                      # dist/ is what the binary runs
cd packages/cli
pnpm link --global              # exposes `fudic` on PATH (pnpm's global bin dir)
fudic --help                    # from any directory
```

`pnpm bin -g` prints the directory that must be on `PATH`; `pnpm setup` puts it there once
and for all. To undo it: `pnpm uninstall --global @fudic/cli`.

**2. Create a project anywhere, skipping the install the CLI cannot satisfy.**

```sh
cd /some/scratch/dir
fudic new demo --no-install --no-git
```

**3. Point its four `@fudic/*` dependencies at this repo, then install for real.** The
generated `package.json` pins `0.0.1` from npm; rewriting them to `link:` makes pnpm
resolve them from disk, dist and all.

```sh
cd demo
node -e "
const fs = require('fs');
const repo = '<absolute path to this repo>';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const field of ['dependencies', 'devDependencies'])
  for (const name of Object.keys(pkg[field] ?? {}))
    if (name.startsWith('@fudic/')) pkg[field][name] = 'link:' + repo + '/packages/' + name.slice(7);
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
pnpm install --ignore-workspace   # --ignore-workspace: the scratch dir is not this monorepo
pnpm build                        # or: pnpm dev
```

**4. Drive the generators against it.**

```sh
fudic g component app-card --in src/routes/index.fud
fudic g page blog
fudic g layout admin --sections aside
pnpm build
```

Two notes on what this proves and what it does not. It exercises the published entry
points (`bin`, `exports`, `dist`, and the `templates/` directory the binary reads at
runtime), which is where packaging bugs live. It does **not** exercise a registry install:
step 3 replaces it. Once the packages ship to npm, steps 2–3 collapse into plain
`fudic new demo`, and this section can go.

## Project layout

Sources live under `src/`; the root belongs to the tooling:

```
demo/
├── src/
│   ├── components/
│   ├── layouts/
│   └── routes/
├── fudic-globals.d.ts
├── package.json
├── sw.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

Those four names are not literals of this package: they come from `@fudic/conventions`, which
`@fudic/vite` reads too — the directory the CLI writes to and the one the plugin discovers routes
in are the same name, from the same place. `--dir` overrides the default per command if you want a
different layout; `src/` itself is a convention, not an option.

## Design

Every command is `plan → apply`:

```ts
import { planComponent, apply } from '@fudic/cli';
import { COMPONENTS_DIR } from '@fudic/conventions';

const plan = await planComponent('app-card', { cwd: '.', force: false, dir: COMPONENTS_DIR, wireInto: [], style: true, slot: false });
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
