import { defineConfig } from '@playwright/test';

/**
 * One server, because the subject is one ORIGIN — and two more for the error pages.
 *
 * Everything else in this repo's end-to-end suites varies the shape of a single
 * application. This one varies the number of applications and holds the origin fixed,
 * which is the only way to observe a store that belongs to the origin — `CacheStorage`.
 *
 * `serve.mjs` is static on purpose: it paints no error page and answers no function. The
 * error pages (SDD-87, `tests/errores.spec.ts`) need each app's own server, so each app runs
 * under `vite preview` on a port of its own: admin under `/admin/`, tienda at `/`.
 *
 * System Chrome (`channel: 'chrome'`), one worker and no retries, for the same reasons as
 * `examples/basic`: the behaviour under test is Service Worker lifecycle, every spec
 * drives several loads across it, and both parallelism and a retry would hide the state
 * being measured.
 */
const ADMIN = 'http://localhost:4374';
const TIENDA = 'http://localhost:4375';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    channel: 'chrome',
    serviceWorkers: 'allow',
    baseURL: 'http://localhost:4373',
  },
  webServer: [
    {
      command: 'node serve.mjs',
      url: 'http://localhost:4373/',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @fudic/example-admin exec vite preview --port 4374 --strictPort',
      url: `${ADMIN}/admin/`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @fudic/example-tienda exec vite preview --port 4375 --strictPort',
      url: `${TIENDA}/`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
