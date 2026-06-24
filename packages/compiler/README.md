# @fudic/compiler

Compiler for `.fud` files — the core of **fudic**, a UI framework based on
**Declarative Shadow DOM**.

> Status: initial scaffolding (SDD-00). No compilation logic yet.
> See the roadmap in [`docs/sdd/`](../../docs/sdd/INDEX.md).

## Scripts

```sh
pnpm typecheck    # strict type-check
pnpm test         # run the test suite (Vitest)
pnpm coverage     # tests with coverage
pnpm build        # emit to ./dist
```

## Toolchain

| Tool | Version |
|---|---|
| TypeScript | 5.9.3 |
| Vite | 8.0.16 |
| Vitest | 4.1.9 |
| oxc-parser | 0.137.0 |

Versions are pinned **exactly** (no `^`/`~`) for reproducibility. See
[SDD-00](../../docs/sdd/SDD-00-toolchain.md).

## License

[MIT](../../LICENSE)
