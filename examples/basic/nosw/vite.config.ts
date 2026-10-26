import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { fudic } from '@fudic/vite';

/**
 * The same app, built WITHOUT a Service Worker — the milestone of SDD-17 §4.7.1.
 *
 * This build emits no worker at all: no registration, no precache, no warm channel. What it
 * must still do is hydrate, and with the URLs a BUILD derives (`hydrateUrl(tag)` with the
 * build id baked into `fudic-main`), which is what makes it different from `pnpm dev`.
 *
 * It is the app's own project, not a copy: the root is the app, so its routes, its `.fudapi`,
 * its `src/server` and `src/browser`, its `fudic.json` and its dependencies are the same files
 * the other build reads (SDD-60 §3.10, §3.15 — none of them can be pointed outside the root).
 * Only three things are its own: `sw: false` stands for the `sw.json` it ignores, the output
 * goes to `nosw/dist`, and the server bundle to `.fudic/edge-nosw`, because the preview of the
 * other build serves `.fudic/edge` and both previews run side by side.
 */
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [fudic({ sw: false, edgeDir: '.fudic/edge-nosw' })],
  build: { outDir: 'nosw/dist', sourcemap: true },
});
