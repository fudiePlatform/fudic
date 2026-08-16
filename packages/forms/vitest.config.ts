import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // `node`, and it is a contract rather than a default: a form model that
    // needs a DOM to be tested is a form model that cannot run on the server
    // (SDD-33 §5). No happy-dom in this package, on purpose.
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
        // New package, so it is born at 100 in the four metrics and not at the
        // 80/80/75 floor of SDD-00. Four, not three: leaving `branches` behind
        // leaves exactly the error paths unmeasured.
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the sibling package: no build coupling.
    alias: {
      '@fudic/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
});
