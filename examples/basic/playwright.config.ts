import { defineConfig } from '@playwright/test';

/**
 * End-to-end harness over the REAL build, served by `vite preview` — the production edge.
 *
 * It uses the system Chrome (`channel: 'chrome'`) instead of Playwright's bundled
 * browsers: what is under test is Service Worker behaviour in the browser the developer
 * actually reproduces the bug in, and it keeps the repo free of a browser download.
 *
 * One worker, no retries: every spec drives a Service Worker lifecycle across several
 * loads, and both parallelism and a retry would hide exactly the state we are measuring.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
