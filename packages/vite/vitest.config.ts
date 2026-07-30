import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        // New code is born at 100 (SDD-00): `swbuild.ts` arrived with BUG-03, so the
        // floor it was written under is the one it keeps.
        'src/swbuild.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the compiler: no build coupling (same pattern
    // as transport → ssr).
    alias: {
      '@fudic/compiler': fileURLToPath(new URL('../compiler/src/index.ts', import.meta.url)),
    },
  },
});
