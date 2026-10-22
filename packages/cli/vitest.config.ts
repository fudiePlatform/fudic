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
        // New code is born at 100 (CLAUDE.md): how `--in` links across packages (SDD-35).
        'src/workspace/link.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // New code is born at 100 (CLAUDE.md): the .fudspec generators (SDD-53).
        'src/plans/spec.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/plans/term.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // New code is born at 100 (CLAUDE.md): `fudic translate` (SDD-58).
        'src/plans/translate.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // New code is born at 100 (CLAUDE.md): the help and the usage errors (BUG-50).
        'src/help/*.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/version.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the workspace packages (same pattern as vite → compiler).
    alias: {
      '@fudic/api': fileURLToPath(new URL('../api/src/index.ts', import.meta.url)),
      '@fudic/compiler': fileURLToPath(new URL('../compiler/src/index.ts', import.meta.url)),
      '@fudic/conventions': fileURLToPath(new URL('../conventions/src/index.ts', import.meta.url)),
      '@fudic/formatter': fileURLToPath(new URL('../formatter/src/index.ts', import.meta.url)),
      '@fudic/language-core': fileURLToPath(new URL('../language-core/src/index.ts', import.meta.url)),
    },
  },
});
