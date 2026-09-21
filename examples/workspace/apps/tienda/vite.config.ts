import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Nothing special: this is a plain fudic app. What makes it interesting is where it ends
// up — the root of an origin it shares with a second, independent application.
export default defineConfig({
  // On, so that what is shared between the two applications can be READ rather than taken
  // on trust: the boot of each one is the same framework code with a different worker URL
  // in it, and a map is how you see that without unminifying by eye.
  build: { sourcemap: true },
  plugins: [fudic()],
});
