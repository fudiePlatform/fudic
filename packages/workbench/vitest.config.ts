import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Most files launch a browser whose every call waits at most five seconds: with one worker
    // per core they starve each other, and a screenshot or a wait times out at random.
    maxWorkers: 2,
    // Launching and closing Chrome in `beforeAll`/`afterAll` while every other package holds
    // the CPUs under `pnpm test` takes longer than the 10 s default (BUG-52, as in `terms`).
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to import:
      // a file no test reaches must show as 0%, never be invisible. Helpers stay out.
      // Anchored to this package: vitest matches the glob anywhere in the absolute path,
      // so a bare `src/**` would also count every file under a parent folder named `src`.
      include: ['src/**/*.ts'].map((glob) => fileURLToPath(new URL(glob, import.meta.url)).replace(/\\/gu, '/')),
      thresholds: {
        // New code is born at 100 in all four metrics (CLAUDE.md).
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
