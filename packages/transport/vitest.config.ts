import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    // Node provides the real platform primitives this shell runs on:
    // MessageChannel/MessagePort, BroadcastChannel, ReadableStream,
    // structuredClone, fetch/Request/Response. SW/WW globals are doubles.
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        // SDD-00 floor for the double-driven modules (router, worker, main)...
        lines: 80,
        functions: 80,
        branches: 75,
        // ...and near-100% for the transport adapter (SDD-16 §6.13).
        'src/adapter.ts': { lines: 100, functions: 100, branches: 100 },
        'src/manifest.ts': { lines: 100, functions: 100, branches: 100 },
        'src/control.ts': { lines: 100, functions: 100, branches: 100 },
      },
    },
  },
  resolve: {
    // Dev-time source resolution of the sibling packages: no build coupling.
    alias: {
      '@fudic/ssr': fileURLToPath(new URL('../ssr/src/index.ts', import.meta.url)),
      '@fudic/dom': fileURLToPath(new URL('../dom/src/index.ts', import.meta.url)),
    },
  },
});
