import { defineConfig } from 'vitest/config';
import { fudicTest } from './src/config.js';

export default defineConfig({
  // The package tests itself the way a project would: through `fudicTest()`.
  plugins: [fudicTest()],
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to look at: without
      // this, a file no test imports simply does not count.
      include: ['src/**/*.ts'],
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
