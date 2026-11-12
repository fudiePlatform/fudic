# `@fudic/spec`

The `.fudspec` language: acceptance criteria written next to a component, a route, or as a flow
between pages.

```
fud-button.fud
fud-button.fudspec
fud-button.fixture.ts      (only when the component has props)

routes/usuarios.fud
routes/usuarios.fudspec    page /usuarios
routes/usuarios.fixture.ts data, calls, paths and services of the route

src/flows/alta.fudspec     flow alta
src/flows/alta.fixture.ts  services (and calls) of the flow
```

## Three kinds of spec

- `component <tag>` mounts the component alone; `given props <case>` picks a case of its fixture.
- `page <route>` opens a route by its URL, with its real layout. The route is written as on disk
  (`page /blog/[slug]`, `page /`). **What the fixture names is fake, the rest is real**:
  `given data <name>+` stands in for `load` (the next name each time the page asks for its data
  again), `answers <group>+` answers functions and `remote` rules without running them,
  `services <group>` puts services in place of the real ones, `path <value>` / `url <url>` say
  which URL opens.
- `flow <name>` runs the real server across pages; its fixture only puts `services` in place,
  one instance per criterion, and `answers` if it wants a call to fail (`fails(0, …)` is a network
  failure).

`given` comes first and once; `when` and `then` alternate after it, and a criterion ends in `then`.
A reference is a tag or `role:<role>` with an exact name (`/"Save"`) or a contained one
(`/~"Ana"`), and steps chain with `>`: `role:row/~"Luis">role:button/"Borrar"`. `as <who>` hands
what follows to another person, in any block.

The fixture of a page is typed with the `Fixtures` its `.fudapi` generates
(`fudic:routes/<route>`); a flow's with `FlowFixtures`. Its helpers return data, never promises,
so the editor reads the fixture without running it: `fails(status, title)` / `fails('code')`,
`redirects(location)`, `later(ms, value)`, `later.never()`, `later.fails(ms, status, title)`,
`file(path, { type?, name? })`.

- `parseSpec(source)` reads a `.fudspec` into a tree with spans everywhere. It never throws.
- `validateSpec(file, ctx)` checks each term line against the module that runs it,
  `<root>/<block>/<term>.js`, in the workspace's `fudic/terms/` first and the framework's after.
  Modules are read with Oxc, never run: `meta` must be an object literal.
- `readFixtures(source, path)` reads the keys of a fixture file's `export default`, and where its
  closing `}` is; for a page or a flow, the names of its `data`, `calls` and `services` groups and
  the values of `paths` (`FUD1510` for a group that is not a literal).
- `validateSpec` also checks the fixture lines against the fixture and, when the host says what a
  page can reach (`SpecIo.reach`/`functions`), `called`/`sent` against its functions and their
  arguments. `findRoute`, `routeFiles` and `matchesPattern` answer which route a `page` names and
  whether a URL is one of its.
- `formatSpec(source)` lays a `.fudspec` out: 0/2/4 indentation, one space between tokens, one
  blank line between criteria. It only moves blanks, and leaves a file with an unclosed quote
  alone.

## Generators

Pure functions, shared by `fudic g spec` / `fudic g term` and the editor's light bulb, so the
terminal and the editor write the same file:

- `specSkeleton(tag, props)`: a new `.fudspec`, with the shape of a criterion commented.
- `fixtureModule(tag, keys, props)` and `fixtureEntry(key, props)`: a fixture file, each required
  prop filled by type (`''`, `0`, `false`, `[]`, the first literal…). `any`, functions and other
  values a fixture cannot write are left out, so the project check says they are missing.
- `pageSpecSkeleton` / `pageFixtureModule` and `flowSpecSkeleton` / `flowFixtureModule`: what
  `fudic g spec /<route>` and `fudic g flow <name>` write, the page's sample `data` built from
  the fields of its `load`.
- `literalOf`, `recordFixture`, `recordLines` and `emptyFixture`: what `fudic-workbench record`
  writes — a recorded answer as a literal (or why it cannot be one), the fixture with the
  criterion's groups replaced, and the `.fudspec` lines renamed to them. The editor's «add the
  missing entry» light bulb writes with `recordFixture` too.
- `termModule(block, name, params)`: a term module the validator reads clean, whose `run` fails
  until it is written.
- `closest(name, candidates)`: the candidate a typo most likely meant.

The props arrive as `PropShape`s, described by whoever holds TypeScript (`propShapes` in
`@fudic/typecheck`).

It does not depend on `@fudic/compiler`.

## Fixture files in the editor

A fixture file imports the component's props type:

```ts
import type { $Props } from './fud-card.fud';
```

VS Code's own TypeScript server does not know what a `.fud` is, so the project declares the
module in its `env.d.ts`:

```ts
declare module '*.fud' {
  export type $Props = any;
}
```

The editor then does not check the fixture's values; the `.fudspec` still checks its names.
