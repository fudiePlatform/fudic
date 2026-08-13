import { defineConfig } from '@playwright/test';

/**
 * Three servers, because the framework has three shapes and hydration has to work in all
 * of them (SDD-17 §4.7.1).
 *
 *  - `preview`   — the real build, `sw.json` and all: the production edge, served by
 *                  `vite preview`. This is where the Service Worker specs live.
 *  - `dev`       — `pnpm dev`. No Service Worker anywhere, and chunk URLs served by the dev
 *                  server per tag instead of derived from a build id.
 *  - `nosw`      — a real BUILD with no `sw.json`: derived URLs, no worker. The combination
 *                  the other two do not cover.
 *
 * It uses the system Chrome (`channel: 'chrome'`) instead of Playwright's bundled browsers:
 * what is under test is Service Worker and hydration behaviour in the browser the developer
 * actually reproduces the bug in, and it keeps the repo free of a browser download.
 *
 * One worker, no retries: every spec drives a lifecycle across several loads, and both
 * parallelism and a retry would hide exactly the state we are measuring.
 */
const HYDRATION = /hydration\.spec\.ts/u;

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
  },
  projects: [
    { name: 'preview', testIgnore: HYDRATION, use: { baseURL: 'http://localhost:4173' } },
    { name: 'dev', testMatch: HYDRATION, use: { baseURL: 'http://localhost:5273' } },
    { name: 'nosw', testMatch: HYDRATION, use: { baseURL: 'http://localhost:4273' } },
  ],
  webServer: [
    {
      command: 'vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173/',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // The readiness probe is the manifest and not a page: the dev server renders a route
      // only for a request that accepts `text/html`, and a probe does not.
      command: 'vite --port 5273 --strictPort',
      url: 'http://localhost:5273/fudic-routes.json',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'vite preview --config nosw/vite.config.ts --port 4273 --strictPort',
      url: 'http://localhost:4273/hidratacion',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
