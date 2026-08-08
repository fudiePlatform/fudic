# @fudic/conventions

Where a fudic project keeps its sources.

```ts
import { SRC_DIR, ROUTES_DIR, COMPONENTS_DIR, LAYOUTS_DIR } from '@fudic/conventions';
```

| Export | Value |
| --- | --- |
| `SRC_DIR` | `src` |
| `ROUTES_DIR` | `routes` |
| `COMPONENTS_DIR` | `components` |
| `LAYOUTS_DIR` | `layouts` |

## Why a package

`fudic new` writes these directories; the Vite plugin discovers routes in one of them. The
two live in different packages with no edge between them — the plugin is a devDependency of
the CLI, the reverse would invert the boundary, and the compiler they both depend on is
fs-free and knows nothing about directories. So the convention had nowhere to live and was
copied. This package is that missing place: both ends import it, and changing the
convention is one edit that reaches both through `pnpm install`.

## What goes in here

One rule: *a name two packages must agree on and neither one owns*. That is why versions,
generated file names such as `fudic-globals.d.ts`, and build output names such as
`fudic-routes.json` are not here — each already has an owner.

## Not configurable

`src/` is a convention, not an option. A convention with a knob is two conventions. The
escape hatch is per command: `--dir` in the CLI, `routesDir` in the plugin.
