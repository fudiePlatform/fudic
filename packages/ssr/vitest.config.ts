import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // The isomorphism test drives browserDom, which wraps the real DOM.
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, anchored to it: vitest matches the glob anywhere in
      // the absolute path, and the aliased siblings are not this package's to count.
      include: ['src/**/*.ts'].map((glob) => fileURLToPath(new URL(glob, import.meta.url)).replace(/\\/gu, '/')),
      thresholds: {
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
      '@fudic/conventions': fileURLToPath(new URL('../conventions/src/index.ts', import.meta.url)),
      '@fudic/di': fileURLToPath(new URL('../di/src/index.ts', import.meta.url)),
      '@fudic/dom': fileURLToPath(new URL('../dom/src/index.ts', import.meta.url)),
    },
  },
});
