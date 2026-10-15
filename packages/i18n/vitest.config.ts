import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `node`: the presets, the pieces and the catalog run in the build, in the server and in the
    // browser alike, and none of them may need a DOM to do it.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to import.
      include: ['src/**/*.ts'],
      thresholds: {
        // New package: born at 100 in the four metrics (CLAUDE.md).
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
