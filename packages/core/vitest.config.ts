import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // The whole package is browser runtime: custom elements, shadow roots, events.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // SDD-00 floor for the DOM-bound modules (FudicElement, scheduler)...
        lines: 80,
        functions: 80,
        branches: 75,
        // ...and near-100% for the pure runtime pieces (SDD-14 §6.13).
        'src/signal.ts': { lines: 100, functions: 100, branches: 100 },
        'src/delegate.ts': { lines: 100, functions: 100, branches: 100 },
        'src/styles.ts': { lines: 100, functions: 100, branches: 100 },
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
