import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Nothing about languages here: `fudic.json` declares them, and the plugin compiles every
// route once per locale with the catalogs of `src/locales/`.
export default defineConfig({
  plugins: [fudic()],
});
