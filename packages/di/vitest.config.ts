import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `node`, and it is a contract rather than a default: nothing in this package
    // may resolve a container by walking the DOM (SDD-38 §4.2), so a suite that
    // needed a DOM to run would be a suite hiding the very thing it must forbid.
    // No happy-dom here, on purpose.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to look
      // at: without this, a file no test imports simply does not count, and
      // coverage goes UP by deleting tests.
      include: ['src/**/*.ts'],
      thresholds: {
        // New package, so it is born at 100 in the four metrics. Four, not three:
        // leaving `branches` behind leaves exactly the error paths unmeasured,
        // and in an injector the error paths are half the product.
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
