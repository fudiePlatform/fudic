import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { fudicTest } from '../../../src/config.js';

/**
 * BUG-51 — two files of the app that hydrate the same component, in ONE worker, so the second
 * always runs where the first left its window. Started by `test/one-worker.test.ts`, never by
 * the package's own run: its include is not this folder.
 */
export default defineConfig({
  plugins: [fudicTest()],
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: { include: ['one-worker/*.test.ts'], maxWorkers: 1, fileParallelism: false },
});
