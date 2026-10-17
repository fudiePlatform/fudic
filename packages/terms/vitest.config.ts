import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package: the runtime and the stock terms it ships. A file
      // no test reaches must show as 0%, never be invisible. Helpers stay out.
      include: ['src/**/*.ts', 'terms/**/*.js'],
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
