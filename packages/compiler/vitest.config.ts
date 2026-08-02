import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    /**
     * Dev-time source resolution of the sibling RUNTIME packages, for the hydration
     * equivalence suite only (`test/emit/hydrate/`). They are devDependencies, not
     * dependencies: `src/` imports no runtime and must not. What that suite needs is the
     * one thing the emit cannot assert about itself — that the tree the server painted is
     * the tree the client adopts — and checking it takes both real adapters.
     */
    alias: {
      '@fudic/dom': fileURLToPath(new URL('../dom/src/index.ts', import.meta.url)),
      '@fudic/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@fudic/ssr': fileURLToPath(new URL('../ssr/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // The balancer (SDD-02) and tokenizer (SDD-03) should approach 100%.
        // Conservative global floor; raised per-module in later SDDs.
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
