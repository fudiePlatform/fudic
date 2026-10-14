import { defineConfig } from 'vitest/config';
import { fudicTest } from './src/config.js';

export default defineConfig({
  test: {
    // The package tests itself the way a project would: through `fudicTest()`. Twice, because
    // two kinds of project are under test: one with no `src/http.ts` and no routes — this
    // package itself, its fixtures beside the tests — and a small app that has both.
    projects: [
      { plugins: [fudicTest()], test: { name: 'unit', include: ['test/*.test.ts'] } },
      { plugins: [fudicTest()], root: 'test/app', test: { name: 'app', include: ['*.test.ts'] } },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to look at: without
      // this, a file no test imports simply does not count.
      include: ['src/**/*.ts'],
      // The test app has a `src` of its own, which is a fixture and not this package.
      exclude: ['test/**'],
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
