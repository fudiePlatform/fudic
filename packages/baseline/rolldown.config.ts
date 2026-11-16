import { defineConfig } from 'rolldown';

/**
 * Each entry as ONE module, as `@fudic/diagnostics` does (BUG-51). The CLI reads a `fudic.json` on
 * every command, and through `@fudic/config` that loads `@fudic/baseline/config`: as the modules `tsc`
 * writes, a handful of resolutions it pays before it starts; bundled, almost nothing. `tsc` still
 * writes the declarations; this replaces the two entry files it wrote. Nothing here reaches a browser.
 */
export default defineConfig({
  input: { index: 'src/index.ts', config: 'src/config.ts' },
  platform: 'node',
  output: { dir: 'dist', format: 'esm', sourcemap: true, entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
});
