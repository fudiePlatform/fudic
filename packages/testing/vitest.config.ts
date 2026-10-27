import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { fudicTest } from './src/config.js';

export default defineConfig({
  test: {
    // The package tests itself the way a project would: through `fudicTest()`. Twice, because
    // two kinds of project are under test: one with no `src/http.fudapi` and no routes — this
    // package itself, its fixtures beside the tests — and a small app that has both.
    projects: [
      { plugins: [fudicTest()], test: { name: 'unit', include: ['test/*.test.ts'] } },
      { plugins: [fudicTest()], root: 'test/app', test: { name: 'app', include: ['*.test.ts'] } },
      // And one with neither `_error.fud` nor `src/http.fudapi`, served under a `base`, for what the
      // harness does without them and with it.
      {
        plugins: [fudicTest()],
        root: 'test/bare-app',
        base: '/sub/',
        test: { name: 'bare-app', include: ['*.test.ts'] },
      },
      // The conformance suite of the portable view: one `.fud` per row and the server's HTML it
      // must give. A project of its own for its `"locales"`, which turn `a | preset` into a pipe.
      {
        plugins: [fudicTest()],
        root: 'test/conformance',
        test: { name: 'conformance', include: ['*.test.ts'] },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The denominator is the whole package, not what the tests chose to look at: without
      // this, a file no test imports simply does not count.
      // Anchored to this package: vitest matches the glob anywhere in the absolute path,
      // so a bare `src/**` would also count every file under a parent folder named `src`, the
      // test app's own `src` among them.
      include: ['src/**/*.ts'].map((glob) => fileURLToPath(new URL(glob, import.meta.url)).replace(/\\/gu, '/')),
      thresholds: {
        // New package: born at 100 in the four metrics.
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
