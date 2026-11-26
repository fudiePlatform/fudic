import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fudic } from '@fudic/vite';

// Pages are the .fud files under src/routes/; fudic() needs nothing else to serve and build them.
// basicSsl() serves them over HTTPS with a development certificate.
export default defineConfig({
  plugins: [fudic(), basicSsl()],
});
