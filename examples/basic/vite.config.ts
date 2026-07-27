import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Nothing else to configure: the plugin discovers `routes/`, infers each route's SSG
// mode, emits the route→chunk manifest and the three-thread bootstraps, and prerenders
// what it can. `outDir` and `base` come from Vite, as always.
export default defineConfig({
  plugins: [fudic()],
});
