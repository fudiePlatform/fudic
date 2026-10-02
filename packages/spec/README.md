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
- `readFixtures(source, path)` reads the keys of a fixture file's `export default`.

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
