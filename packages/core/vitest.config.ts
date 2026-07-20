import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // Kept on happy-dom: `signal` is pure, but the emit-side runtime that lands
    // next (FudicElement, SDD-15 §3.7) is custom elements and shadow roots.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // Everything left in the package is pure runtime, so the SDD-00 floor
        // (80/80/75) does not apply here: 100% is reachable and expected.
        lines: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the sibling package: no build coupling.
    alias: {
      '@fudic/dom': fileURLToPath(new URL('../dom/src/index.ts', import.meta.url)),
    },
  },
});
