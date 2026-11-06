# @fudic/cli

The `fudic` command: it creates apps and workspaces, adds pieces to them, and runs them. Every
project it creates can be tested from the first minute: `pnpm test` and `pnpm spec` are green
right after `fudic new`.

```sh
npm install -g @fudic/cli   # or pnpm dlx @fudic/cli …
fudic --help                # where to start
fudic <command> --help      # what a command takes
```

## Words

- **app**: what you serve. It has pages and a base URL (`/`, `/admin/`).
- **library**: components your apps use. It is not served.
- **workspace**: one repo with `apps/` and `libs/`.
- **project**: an app or a library. `--project <name>` picks one inside a workspace; without
  it, the project is the one you are in.

## Start

```sh
fudic new shop                                  # an app
fudic new shop --workspace                      # an empty workspace: apps/ and libs/
fudic new shop --workspace --lib ui             # … with a library and no app yet
fudic new shop --workspace --app web            # … with its first app, at /
fudic new shop --workspace --app web --uses ui  # … and a library ui it already uses
```

Every project starts with a style guide: tokens with a dark mode, a self-hosted font, a favicon
and a stylesheet per element. An app keeps its own in `src/guide/`; a workspace has `libs/guide`,
and every app and library it creates depends on it. Every page links the guide, pruned to what
it uses; a component adopts the pieces it names (`shadowrootadoptedstylesheets="button"`), and
the editor adds a piece when you write its element.

An app's pages render inside a layout of its own (`--layout <name>`, `_layout` by default), a
library's (`--layout @shop/ui/layouts/main.fud`) or none (`--no-layout`). `fudic g page` puts a
new page in the nearest layout of the app, or else in the one its home page uses.

## Add to a project

```sh
fudic g lib ui                           # a library; its tag prefix is ui-
fudic g app admin --uses ui              # another app, at /admin/
fudic g component button --project ui    # <ui-button>: .fud, unit test, .fudspec, fixture
fudic g page blog/:slug                  # a page and its unit test
fudic g layout docs --sections nav       # a layout and its unit test
fudic g layout main --project ui         # a layout apps share: href="@shop/ui/layouts/main.fud"
fudic g snippet ui productCard --project ui   # a snippet in src/snippets/ui.fud, and its test
fudic g service cart                     # a service you inject(), and its test
fudic g form person --binary             # a form with typed controls, and its test
fudic g style theme                      # a global stylesheet of the project
fudic g guide                            # the style guide: libs/guide, or src/guide/ in an app
fudic g spec button --project ui         # the .fudspec criteria of a component and their fixture
fudic g term then cart-has --param n:number   # a step of your own for .fudspec criteria
fudic g api src/components/shop-cart     # its server: the .fudapi, its handler and its link
fudic g showcase ui                      # an app with a page per component, a block per case
fudic add forms --project admin          # an optional module: di, forms, http, i18n
fudic add ui --project web               # a library of the workspace
```

`g` is `generate`. Nothing asks: every choice is an argument or an option, so every command
goes into a script as it is. `--dry-run` shows what a command would write and run, and `--json`
prints it as data.

`g api` takes the `.fud` of a route or a component, or the folder of a component, relative to
the project. A component gets a `hello` function to start from; a route, its `load`. The handler
goes in the server folder of `fudic.json` (`src/server` by default), at the `<id>` of the `.fudapi`.

`g showcase` writes one page per component that has a fixture, with a block per case as the
fixture holds it, and an index. In a workspace the pages live in an app that uses the library
(`--app`, default `showcase`), created when it does not exist; in an app on its own, under
`src/routes/showcase`. Every file it writes is marked on its first line: run it again after
changing a fixture and it rewrites its own files, adds the new ones and deletes the ones whose
component lost its fixture. A file without the mark in its way is someone's, and it stops.

## Run

```sh
fudic dev        # every app on one port, each under its base URL
fudic preview    # the same, with each app's build
fudic test       # the unit tests of the project, or of every project from the root
fudic spec       # the .fudspec criteria, in a browser
```

A workspace runs them as `pnpm dev`, `pnpm preview`, `pnpm test` and `pnpm spec`, and one app
on its own as `pnpm --filter <app> dev`.

## Maintain

```sh
fudic fmt [path…]   # format .fud and .fudspec files; --check for CI
fudic translate     # extract the texts to translate into src/locales/
```

## The history of a piece

Each component and route keeps a `.fudlog` next to its `.fud`: it only grows, it goes to git,
and `fudic new` writes the `.gitattributes` that lets two branches add to it without a conflict.

```sh
fudic approve src/components/acme-button              # approve its criteria and props
fudic accept  src/components/acme-button "Looks good"  # the client accepted it; tags HEAD
fudic history src/components/acme-button              # what still holds, now
```

```
acme-button  approved by pedro (valid) · tests pass 6/6 · spec pass 4/4 · done
```

A piece is a component's or a route's `.fud`, or its folder. `approve` writes your git name and
the hash of the `.fudspec` and its fixture: touch either and the approval expires. `accept` tags
the commit you are on as `accepted/<name>/<date>`. `history --json` prints the whole state.

## Errors

A command that cannot run says why in one line, how to go on in the next, and which help to
read. Codes are `FUD0440`–`FUD0459`; each one is explained in `@fudic/diagnostics`.

## Developing the CLI

`pnpm verify:generated`, from the root of this repository, publishes the packages to a local
registry, runs every generator in a temporary folder as a user would, and checks that each
project passes `pnpm test`, `pnpm spec` and `pnpm build` untouched. Run it before landing any
change to a generator or a template; a new generator has to be added to its table.
