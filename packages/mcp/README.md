# `@fudic/mcp`

The fudic MCP server. It lets an agent (Claude Code) or a chat that knows nothing about fudic
(Claude on the web) learn it and build with it, inside one project: read the guide, create pieces
with the same generators as the CLI, write files, check, fix, run the tests and the criteria, and
know at every moment what the next step is.

It runs **inside the project**: the folder it is started in is the only thing it reads and writes.

## Install

`fudic new` already adds it to the project's `devDependencies` and writes `.mcp.json`,
`AGENTS.md` and `CLAUDE.md`. In a project made before that:

```sh
pnpm add -D @fudic/mcp
```

Or once for every project on the machine:

```sh
npm install -g @fudic/mcp
```

Whichever is installed, it checks, builds and runs with the fudic **the project** installed —
its compiler, checker, CLI and test runners — so it says what the project's own build says.

## Claude Code

`.mcp.json`, at the root of the project, starts it over stdio:

```json
{ "mcpServers": { "fudic": { "command": "pnpm", "args": ["exec", "fudic-mcp"] } } }
```

Over stdio it does not offer `fudic_files`, `fudic_read` or `fudic_write`: the agent has its own.

## Claude on the web

A chat connects from Anthropic's servers, not from your browser, so it needs a public URL: a
tunnel to your machine. With [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
installed (`winget install Cloudflare.cloudflared`, `brew install cloudflared`):

```sh
pnpm exec fudic-mcp --http --tunnel
```

```
fudic MCP · project acme · http
  local   http://127.0.0.1:4317/mcp/7f3c…e91a
  public  https://brave-otter-12.trycloudflare.com/mcp/7f3c…e91a
Add the public URL in Claude: Settings → Connectors → Add custom connector.
Anyone with this URL can read and write this project. Stop with Ctrl+C.
```

Add the public URL as a custom connector, open a new conversation and ask for what you want
(«I want a component library: Button, Card, Input»). The `new-app` prompt starts it for you.

| Command | What it does |
|---|---|
| `fudic-mcp` | stdio, for an agent |
| `fudic-mcp --http` | HTTP on `127.0.0.1:4317`, for a chat |
| `fudic-mcp --http --tunnel` | and a public URL through cloudflared |
| `fudic-mcp --http --port 5000` | another port |
| `fudic-mcp --http --new-secret` | a new secret: the old URL stops working |

The quick tunnel gives a new URL on every start. For a fixed one, point a tunnel of your own at
the local port.

### The secret

The last part of the URL is a secret: 32 random bytes, kept in `.fudic/mcp/secret` (ignored by
git) and reused on every start. Any other path answers `404`. The server listens on `127.0.0.1`
only: what reaches it from outside is what the tunnel brings.

**Anyone with the URL can read and write the project.** Do not paste it where others can see it;
if it leaks, start with `--new-secret`. The server runs no command a chat sends: the only commands
it runs are those of a fudic plan (`pnpm install` after `fudic_new` or `fudic_add`).

## The tools

| Tool | What it does |
|---|---|
| `fudic_status` | Where the project is and the one next step. The first call, always |
| `fudic_guide` | A topic of the guide (`overview`, `components`, `pages`, `view`, `fudapi`, `fudspec`, `testing`, `html-css`, `workflow`) or a diagnostic code explained |
| `fudic_new` | Creates the app, or a workspace, in the server's folder |
| `fudic_generate` | `fudic g <kind>`: component, page, layout, spec, api, lib… |
| `fudic_add` | `fudic add`: di, forms, http, i18n or a library of the workspace |
| `fudic_record` | Writes in a piece's history what the user approved or accepted, a reopening, or that it is done |
| `fudic_check` | What the build would say, without building |
| `fudic_fix` | Applies the repairs that have only one option |
| `fudic_format` | `fudic fmt` |
| `fudic_symbols` | Routes, components, types, functions, middlewares, pipes and tokens |
| `fudic_describe` | One of them in full; a component with an example of use that compiles |
| `fudic_contract` | What a `.fudapi` needs implemented, and a skeleton of it |
| `fudic_test` | The unit tests |
| `fudic_spec_run` | The criteria of the `.fudspec` files, in a browser |
| `fudic_files`, `fudic_read`, `fudic_write` | The project's files — over HTTP only |

Every answer is JSON with the same shape: the fudic version, the commit, what the tool says, its
diagnostics (each with `file:line:column` and the line it is on) and `next`, one sentence.

In a workspace, started at its root, the server checks and runs each app and library on its own,
as its build does. To work on the functions of an app's `.fudapi`, start it in the app's folder.
