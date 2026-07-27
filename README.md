# fudic

A UI framework based on **Declarative Shadow DOM**.

> Status: initial scaffolding (SDD-00). The roadmap lives in [`docs/sdd/`](./docs/sdd/INDEX.md).

This repository is a **pnpm monorepo**. Packages live under [`packages/`](./packages) and
runnable demo apps under [`examples/`](./examples).

## Packages

| Package | Path | Description |
|---|---|---|
| [`@fudic/compiler`](./packages/compiler) | `packages/compiler` | Compiler for `.fud` files. |
| [`@fudic/dom`](./packages/dom) | `packages/dom` | Isomorphic DOM contract + browser adapter. |
| [`@fudic/ssr`](./packages/ssr) | `packages/ssr` | Server-side rendering adapter (streaming serializer). |
| [`@fudic/core`](./packages/core) | `packages/core` | Client runtime (signals; hydration is pending). |
| [`@fudic/transport`](./packages/transport) | `packages/transport` | Three-thread client shell (main · Service Worker · Web Worker). |
| [`@fudic/vite`](./packages/vite) | `packages/vite` | Vite plugin: filesystem routing, SSG, the three-thread bootstraps. |

## Examples

| Example | Path | What it shows |
|---|---|---|
| [`basic`](./examples/basic) | `examples/basic` | A real app with `vite dev` / `build` / `preview`: filesystem routing, static + incremental SSG, scoped-CSS components, zero framework JS on the page. |

## Requirements

- Node.js `>=22.12.0` (see [`.nvmrc`](./.nvmrc))
- [pnpm](https://pnpm.io) `11.x` (managed by Corepack via `packageManager`)

## Development

```sh
pnpm install      # install all workspace dependencies
pnpm typecheck    # strict type-check across packages
pnpm test         # run every package's test suite
pnpm build        # build every package
```

## License

[MIT](./LICENSE)
