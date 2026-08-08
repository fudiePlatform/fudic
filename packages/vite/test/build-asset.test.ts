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
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { allCode } from './helpers/output.js';


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
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), PAGE);
  // Arbitrary bytes with a .png extension — Vite hashes and emits it by content. Big
  // enough to clear the DEFAULT inline limit, because the link pass is a nested build that
  // does not inherit `assetsInlineLimit`: under the limit it would inline a data URI and
  // the published chunk would name no file at all.
  writeFileSync(join(root, 'src', 'routes', 'logo.png'), Buffer.alloc(5000, 7));
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: ['/fudic-main.js'] }));
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
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

  it('references the hashed URL from the chunk that ships, not the dead ./logo.png', () => {
    // Since SDD-27 §5.1 the `page` chunks are pruned, so the published render code is
    // `sw/c`. That makes this a STRONGER check: the chunk the Service Worker will link is
    // the one asserted to point at a file the build really wrote.
    const png = output.find((o) => o.type === 'asset' && /logo-[\w-]+\.png$/u.test(o.fileName))!;
    const code = allCode(output);
    expect(code).toContain(png.fileName.replace(/^.*\//u, '')); // the hashed basename appears
    expect(code).not.toContain('"./logo.png"'); // the source specifier is gone
    expect(code).toContain('https://cdn.example/remote.png'); // absolute URL left as-is
  });
});
