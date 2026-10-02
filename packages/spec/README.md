# `@fudic/spec`

The `.fudspec` language: acceptance criteria written next to a component.

```
fud-button.fud
fud-button.fudspec
fud-button.fixture.ts      (only when the component has props)
```

- `parseSpec(source)` reads a `.fudspec` into a tree with spans everywhere. It never throws.
- `validateSpec(file, ctx)` checks each term line against the module that runs it,
  `<root>/<block>/<term>.js`, in the workspace's `fudic/terms/` first and the framework's after.
  Modules are read with Oxc, never run: `meta` must be an object literal.
- `readFixtures(source, path)` reads the keys of a fixture file's `export default`, and where its
  closing `}` is.
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
