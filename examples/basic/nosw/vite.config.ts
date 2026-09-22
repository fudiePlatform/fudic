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
 * The public directory is shared for the same reason — the favicon this app writes in its
 * layout is `/logo.svg`, and a root without it serves a page with a broken icon.
 *
 * What cannot be shared is `fudic.json`: it is read from the ROOT of the project being built,
 * and the root here is this directory. So there is one beside this file, and it points at the
 * app's own style guide rather than copying it — without it the documents come out with no
 * `_theme` to adopt, and the same app looks different depending on which of the two builds
 * you are looking at, which is the one thing a comparison like this must not do.
 */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  plugins: [fudic({ routesDir: '../src/routes' })],
  build: { sourcemap: true },
});
