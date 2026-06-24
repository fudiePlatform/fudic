# fudic

A UI framework based on **Declarative Shadow DOM**.

> Status: initial scaffolding (SDD-00). The roadmap lives in [`docs/sdd/`](./docs/sdd/INDEX.md).

This repository is a **pnpm monorepo**. Every package lives under [`packages/`](./packages).

## Packages

| Package | Path | Description |
|---|---|---|
| [`@fudic/compiler`](./packages/compiler) | `packages/compiler` | Compiler for `.fud` files. |

More packages (`@fudic/core` and its `ssr` / `dom` layers) will be added later.

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
