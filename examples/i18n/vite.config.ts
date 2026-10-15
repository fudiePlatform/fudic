import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Nothing about languages here: `fudic.json` declares them, and the plugin compiles every
// route once per locale with the catalogs of `src/locales/`.
//
// `sourcemap` is on because this is an example you debug: the Service Worker's chunks and
// every hydration chunk step through their `.fud`.
export default defineConfig({
  plugins: [fudic()],
  build: { sourcemap: true },
});
