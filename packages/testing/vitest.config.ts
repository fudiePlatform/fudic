import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { fudicTest } from './src/config.js';

/**
 * `lib-workspace/apps/admin` depends on `lib-workspace/libs/ui`, installed as pnpm installs a
 * workspace package: a link under its `node_modules`. `node_modules` is never committed, so the
 * link is made here, before the project that needs it is read.
 */
const LIB_LINK = fileURLToPath(new URL('./test/lib-workspace/apps/admin/node_modules/@fixture/ui', import.meta.url));
if (!existsSync(LIB_LINK)) {
  mkdirSync(fileURLToPath(new URL('./test/lib-workspace/apps/admin/node_modules/@fixture', import.meta.url)), { recursive: true });
  symlinkSync(fileURLToPath(new URL('./test/lib-workspace/libs/ui', import.meta.url)), LIB_LINK, 'junction');
}

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
      // Two locales: the only case where a test's imports and a page's modules carry a tag. With
      // one, as every other project here, nothing is tagged (SDD-71 §3.1).
      {
        plugins: [fudicTest()],
        root: 'test/locales-app',
        test: { name: 'locales-app', include: ['*.test.ts'] },
      },
      // An app under `/admin/` without `_error.fud`, whose library offers one (SDD-87 §3.2).
      {
        plugins: [fudicTest()],
        root: 'test/lib-workspace/apps/admin',
        base: '/admin/',
        test: { name: 'lib-workspace', include: ['*.test.ts'] },
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
