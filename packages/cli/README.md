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
fudic new shop --workspace --app web            # a workspace with its first app, at /
fudic new shop --workspace --app web --uses ui  # … and a library ui it already uses
```

## Add to a project

```sh
fudic g lib ui                           # a library; its tag prefix is ui-
fudic g app admin --uses ui              # another app, at /admin/
fudic g component button --project ui    # <ui-button>: .fud, unit test, .fudspec, fixture
fudic g page blog/:slug                  # a page and its unit test
fudic g layout docs --sections nav       # a layout and its unit test
fudic g layout main --project ui         # a layout apps share: href="@shop/ui/layouts/main.fud"
fudic g service cart                     # a service you inject(), and its test
fudic g form person --binary             # a form with typed controls, and its test
fudic g style theme                      # a global stylesheet of the project
fudic g lib guia --styles-only           # a library of design tokens and nothing else
fudic g term then cart-has --param n:number   # a step of your own for .fudspec criteria
fudic add forms --project admin          # an optional module: di, forms, http, i18n
fudic add ui --project web               # a library of the workspace
```

`g` is `generate`. Nothing asks: every choice is an argument or an option, so every command
goes into a script as it is. `--dry-run` shows what a command would write and run, and `--json`
prints it as data.

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

## Errors

A command that cannot run says why in one line, how to go on in the next, and which help to
read. Codes are `FUD0440`–`FUD0459`; each one is explained in `@fudic/diagnostics`.
