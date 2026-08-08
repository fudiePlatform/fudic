import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Almost nothing to configure: the plugin discovers `src/routes/`, infers each route's SSG
// mode, emits the route→chunk manifest and the three-thread bootstraps, and prerenders
// what it can. `outDir` and `base` come from Vite, as always.
//
// `sourcemap` is the exception, and it is on because this is the example you debug. Vite
// defaults it to `false`, and BUG-05 deliberately did not change that default — it made
// the option reach the two NESTED builds, which had been ignoring it in silence. With it
// on, `fudic-sw.js` and every `sw/c/*.js` ship a `.map`: the worker's own code steps
// through `@fudic/transport`, and a linked chunk steps through its `.fud`.
export default defineConfig({
  plugins: [fudic()],
  build: { sourcemap: true },
});
