import { defineConfig } from 'rolldown';

/**
 * The two bundles that make up the `.vsix` (SDD-25 §4.5).
 *
 * Installing the extension must not require installing anything else, so the server travels
 * inside it. `vsce package --no-dependencies` then ships no `node_modules` at all, which
 * also sidesteps pnpm's symlinked tree — something `vsce` has never handled well.
 */
export default defineConfig([
  {
    /**
     * The extension: CommonJS, because VS Code loads `main` with `require` while this repo
     * is ESM with `verbatimModuleSyntax`. The bundle is that boundary, which is why this
     * package has no `tsconfig.build.json` and `build` is not `tsc`.
     */
    input: { extension: 'src/extension.ts' },
    platform: 'node',
    // Injected by the host; bundling it would shadow the real one.
    external: ['vscode'],
    output: { dir: 'dist', format: 'cjs', entryFileNames: '[name].cjs' },
  },
  {
    /**
     * The server: ESM, because it is not loaded by the extension host at all — the client
     * forks it as a plain Node process. Keeping it ESM matters: it resolves its fallback
     * TypeScript through `createRequire(import.meta.url)`, which does not exist in CJS.
     */
    input: { server: 'bundle/server-entry.ts' },
    platform: 'node',
    // Never statically imported by the server — it is loaded by path at runtime, from the
    // `tsdk` the client resolves. Bundling ten megabytes of compiler for a `require` that
    // only runs as a last resort would be the wrong trade.
    external: ['typescript'],
    output: { dir: 'dist', format: 'esm', entryFileNames: '[name].mjs' },
  },
]);
