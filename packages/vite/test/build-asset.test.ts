/**
 * SDD-19 §4.5 end-to-end: a real `vite build` over a page with a static relative
 * `<img src="./logo.png">` links the asset through Vite — the image is emitted as a
 * hashed file and the page chunk references that final URL, not the dead `./logo.png`.
 * Proves the emit's injected asset imports (linkAssets) are resolved by Vite's pipeline.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fudic } from '../src/index.js';

const ssrDist = fileURLToPath(new URL('../../ssr/dist/index.js', import.meta.url));
const transportDist = fileURLToPath(new URL('../../transport/dist/index.js', import.meta.url));

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body>
<img src="./logo.png">
<img src="https://cdn.example/remote.png">
</body>
</html>
`;

interface OutFile {
  readonly type: 'chunk' | 'asset';
  readonly fileName: string;
  readonly code?: string;
  readonly source?: string | Uint8Array;
}

let output: OutFile[];

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-asset-'));
  mkdirSync(join(root, 'routes'), { recursive: true });
  writeFileSync(join(root, 'routes', 'index.fud'), PAGE);
  // Arbitrary bytes with a .png extension — Vite hashes and emits it by content.
  writeFileSync(join(root, 'routes', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { '@fudic/ssr': ssrDist, '@fudic/transport': transportDist } },
    plugins: [fudic()],
    build: { write: false, minify: false, assetsInlineLimit: 0 }, // force a separate hashed file
  })) as unknown as { output: OutFile[] };
  output = result.output;
}, 120000);

describe('vite build — asset linking', () => {
  it('emits the referenced image as a hashed asset file', () => {
    const asset = output.find((o) => o.type === 'asset' && /logo-[\w-]+\.png$/u.test(o.fileName));
    expect(asset).toBeDefined();
  });

  it('references the hashed URL from the page chunk, not the dead ./logo.png', () => {
    const png = output.find((o) => o.type === 'asset' && /logo-[\w-]+\.png$/u.test(o.fileName))!;
    const code = output
      .filter((o) => o.type === 'chunk')
      .map((c) => c.code ?? '')
      .join('\n');
    expect(code).toContain(png.fileName.replace(/^.*\//u, '')); // the hashed basename appears
    expect(code).not.toContain('"./logo.png"'); // the source specifier is gone
    expect(code).toContain('https://cdn.example/remote.png'); // absolute URL left as-is
  });
});
