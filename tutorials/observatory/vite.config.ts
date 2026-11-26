import { defineConfig } from 'vite';
import { fudic } from '@fudic/vite';

// Pages are the .fud files under src/routes/; fudic() needs nothing else to serve and build them.
// allowedHosts lets the preview answer through a Cloudflare tunnel.
export default defineConfig({
  plugins: [fudic()],
  preview: { allowedHosts: ['.trycloudflare.com'] },
});
