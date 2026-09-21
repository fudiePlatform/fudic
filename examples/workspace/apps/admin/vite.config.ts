import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// The only thing that distinguishes this app from the storefront is WHERE it is published.
// `base` is threaded through everything that derives a URL — the Service Worker's scope
// included, which is the directory of its script — so this build owns `/admin/*` and
// nothing above it.
//
// What `base` does NOT reach is the names in `CacheStorage`, because that store is a
// property of the ORIGIN and not of a worker's scope. Namespacing it is the `id` in
// `fudic.json`, and this app is the reason that field exists.
export default defineConfig({
  base: '/admin/',
  // Same as the storefront, and for the same reason: with maps on, the two boots can be
  // compared as source instead of as minified text.
  build: { sourcemap: true },
  plugins: [fudic()],
});
