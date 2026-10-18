import { defineConfig } from 'rolldown';

/**
 * The catalogue as ONE module (BUG-51). A code is a file of its own in `src/codes/` — that is
 * how the catalogue is written and reviewed — but loading it that way is three hundred module
 * resolutions, and every process that reports anything pays them before it starts: the CLI
 * spent 135 ms of its own start on them. `tsc` still writes the declarations beside it; this
 * replaces the `index.js` it wrote with the bundled one. Nothing here reaches a browser.
 */
export default defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  output: { file: 'dist/src/index.js', format: 'esm', sourcemap: true },
});
