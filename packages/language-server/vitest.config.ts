import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests happened to import:
      // a file no test reaches must show as 0%, never be invisible. Test helpers stay out.
      include: ['src/**/*.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the workspace siblings: no build coupling.
    alias: {
      '@fudic/compiler': fileURLToPath(new URL('../compiler/src/index.ts', import.meta.url)),
      '@fudic/cli': fileURLToPath(new URL('../cli/src/index.ts', import.meta.url)),
      '@fudic/formatter': fileURLToPath(new URL('../formatter/src/index.ts', import.meta.url)),
      '@fudic/language-core': fileURLToPath(
        new URL('../language-core/src/index.ts', import.meta.url),
      ),
    },
  },
});
