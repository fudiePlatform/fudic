import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The servers under test run in process, and Volar writes to the console on its own — a
    // `console.warn` per capability the test client does not declare, a batch of diagnostics
    // 250 ms after an edit. Intercepted, a write that lands while Vitest closes the file fails
    // the run with "Closing rpc while onUserConsoleLog was pending" (BUG-52). Straight to Node.
    disableConsoleIntercept: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests happened to import:
      // a file no test reaches must show as 0%, never be invisible. Test helpers stay out.
      // Anchored to this package: vitest matches the glob anywhere in the absolute path,
      // so a bare `src/**` would also count every file under a parent folder named `src`.
      include: ['src/**/*.ts'].map((glob) => fileURLToPath(new URL(glob, import.meta.url)).replace(/\\/gu, '/')),
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the workspace siblings: no build coupling.
    alias: {
      '@fudic/compiler': fileURLToPath(new URL('../compiler/src/index.ts', import.meta.url)),
      '@fudic/cli': fileURLToPath(new URL('../cli/src/index.ts', import.meta.url)),
      '@fudic/formatter': fileURLToPath(new URL('../formatter/src/index.ts', import.meta.url)),
      '@fudic/language-core': fileURLToPath(
        new URL('../language-core/src/index.ts', import.meta.url),
      ),
      '@fudic/typecheck': fileURLToPath(new URL('../typecheck/src/index.ts', import.meta.url)),
    },
  },
});
