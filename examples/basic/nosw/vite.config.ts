import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { fudic } from '@fudic/vite';

/**
 * The same app, built WITHOUT a Service Worker — the milestone of SDD-17 §4.7.1.
 *
 * No `sw.json` lives in this directory, and `sw.json` is looked up at the project root, so
 * this build emits no worker at all: no registration, no precache, no warm channel. What it
 * must still do is hydrate, and with the URLs a BUILD derives (`hydrateUrl(tag)` with the
 * build id baked into `fudic-main`), which is what makes it different from `pnpm dev`.
 *
 * It shares the routes rather than copying them: `routesDir` points back at the app's own
 * `src/routes`, so the pages under test are the same files, not a fixture that can drift.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [fudic({ routesDir: '../src/routes' })],
});
