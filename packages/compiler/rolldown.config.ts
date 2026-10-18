import { isAbsolute } from 'node:path';
import { defineConfig } from 'rolldown';

/**
 * The compiler as ONE module (BUG-51). It is written as some 160 modules, and every process
 * that compiles — the dev server, its typecheck, the CLI, each test worker — resolved and
 * evaluated all of them before it did anything: a sixth of a second each time. `tsc` still
 * writes the declarations; this replaces the `index.js` it wrote with the bundled one.
 *
 * What it depends on stays outside, as the packages they are: `oxc-parser` is a native addon,
 * and `@fudic/*` are other packages with instances of their own.
 */
export default defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  external: (id) => !id.startsWith('.') && !isAbsolute(id),
  output: { file: 'dist/index.js', format: 'esm', sourcemap: true },
});
