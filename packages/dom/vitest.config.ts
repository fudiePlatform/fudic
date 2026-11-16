import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // browserDom and Cursor wrap the real DOM API; happy-dom provides it.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to look at: without this,
      // a file no test imports simply does not count. Anchored to this package, because vitest
      // matches the glob anywhere in the absolute path.
      include: ['src/**/*.ts'].map((glob) => fileURLToPath(new URL(glob, import.meta.url)).replace(/\\/gu, '/')),
      exclude: ['**/*.d.ts'],
      thresholds: {
        // The contract and the adapter are thin and fully exercisable, and they are: the four
        // metrics at 100, so a branch that stops being tested is a failure and not a decimal.
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
