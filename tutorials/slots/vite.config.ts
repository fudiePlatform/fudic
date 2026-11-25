import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Pages are the .fud files under src/routes/; fudic() needs nothing else to serve and build them.
export default defineConfig({
  plugins: [fudic()],
});
