import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Nothing special: this is a plain fudic app. What makes it interesting is where it ends
// up — the root of an origin it shares with a second, independent application.
export default defineConfig({
  plugins: [fudic()],
});
