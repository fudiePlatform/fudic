import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The `new demo` end-to-end test runs a real `vite build` over the generated tree.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the workspace packages (same pattern as vite → compiler).
    alias: {
      '@fudic/compiler': fileURLToPath(new URL('../compiler/src/index.ts', import.meta.url)),
      '@fudic/formatter': fileURLToPath(new URL('../formatter/src/index.ts', import.meta.url)),
      '@fudic/language-core': fileURLToPath(new URL('../language-core/src/index.ts', import.meta.url)),
    },
  },
});
