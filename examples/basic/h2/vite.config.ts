import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import app from '../vite.config.js';

/**
 * The preview of the same build, over HTTP/2: the one protocol Chrome takes a `103 Early Hints`
 * on. Vite serves HTTP/2 as soon as it is given a certificate, and a browser speaks HTTP/2 only
 * over TLS.
 *
 * The certificate is .NET's development one for `localhost`, exported as PEM by `pnpm cert:h2`:
 * Windows already trusts it, so the browser opens the page without a warning — and a page with a
 * certificate warning is one Chrome may not apply the early hints to. The two `.pem` files are
 * local to each machine and never committed.
 */
const pem = (name: string): Buffer => readFileSync(fileURLToPath(new URL(name, import.meta.url)));

export default mergeConfig(
  app,
  defineConfig({
    root: fileURLToPath(new URL('..', import.meta.url)),
    preview: { https: { cert: pem('./localhost.pem'), key: pem('./localhost.key') } },
  }),
);
