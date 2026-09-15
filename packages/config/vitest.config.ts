import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to import:
      // a file no test reaches must show as 0%, never be invisible. Helpers stay out.
      include: ['src/**/*.ts'],
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
