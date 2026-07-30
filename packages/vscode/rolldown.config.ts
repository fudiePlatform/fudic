import { defineConfig } from 'rolldown';

/**
 * The extension bundle (SDD-25 §4.5).
 *
 * CommonJS on purpose: VS Code loads `main` with `require`, while this repo is ESM with
 * `verbatimModuleSyntax`. The source stays TS/ESM and the bundle is the boundary — which
 * is why this package has no `tsconfig.build.json` and `build` is not `tsc`.
 *
 * `vscode` is injected by the host, never bundled.
 */
export default defineConfig({
  input: { extension: 'src/extension.ts' },
  platform: 'node',
  external: ['vscode'],
  output: {
    dir: 'dist',
    format: 'cjs',
    entryFileNames: '[name].cjs',
  },
});
