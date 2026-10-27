import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // A `beforeAll` launches Chrome, and under `pnpm test` every package has the CPUs: the 10 s
    // of the default is not enough to start a browser there (BUG-52).
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package: the runtime and the stock terms it ships. A file
      // no test reaches must show as 0%, never be invisible. Helpers stay out.
      // Anchored to this package: vitest matches the glob anywhere in the absolute path,
      // so a bare `src/**` would also count every file under a parent folder named `src`.
      include: ['src/**/*.ts', 'terms/**/*.js'].map((glob) => fileURLToPath(new URL(glob, import.meta.url)).replace(/\\/gu, '/')),
      thresholds: {
        // New package: born at 100 in the four metrics.
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
