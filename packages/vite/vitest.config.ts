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
        // The project's style guide, read by the host (SDD-42), and the registry that names
        // every file a `.fud` links (BUG-40). Same rule, same floor, from their first commit.
        'src/styles.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/linked-assets.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        // The libraries of SDD-43: what a `<link>` names before the graph is walked, and the
        // compiler range a library declares. Same rule, same floor, from their first commit.
        'src/link-check.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
        'src/peer-check.ts': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the compiler: no build coupling (same pattern
    // as transport → ssr).
    alias: {
      '@fudic/compiler': fileURLToPath(new URL('../compiler/src/index.ts', import.meta.url)),
      '@fudic/conventions': fileURLToPath(new URL('../conventions/src/index.ts', import.meta.url)),
    },
  },
});
