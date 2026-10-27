import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Checking a project builds a whole TypeScript program, and under `pnpm -r test` the other
    // packages have the CPUs: a cold start is well over the 5s default. The same goes for a
    // hook that checks the project once for a whole file.
    testTimeout: 60_000,
    hookTimeout: 60_000,
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
      '@fudic/language-core': fileURLToPath(
        new URL('../language-core/src/index.ts', import.meta.url),
      ),
    },
  },
});
