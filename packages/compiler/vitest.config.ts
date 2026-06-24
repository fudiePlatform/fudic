import { defineConfig } from 'vitest/config';

export default defineConfig({
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
