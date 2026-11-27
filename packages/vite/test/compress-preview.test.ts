/**
 * Finding 1 of the website, in a real `vite build` and `vite preview`: the page that
 * `@fudic/server` answers and the files Vite serves come compressed, as a host would send them.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { request, type IncomingHttpHeaders } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { fudic } from '../src/index.js';
import { runtimeAlias, writeTypecheckConfig } from './helpers/alias.js';

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

/** What Chrome sends: gzip comes first, and Vite's own compression would take it. */
const CHROME = 'gzip, deflate, br, zstd';

/** `path` asked as Chrome asks it, its body as it came over the wire. */
function get(port: number, path: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({ host: 'localhost', port, path, headers: { 'accept-encoding': CHROME, accept: 'text/html' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('vite preview compresses what it serves', () => {
  let server: PreviewServer;
  let port = 0;
  let dist = '';

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-compress-preview-'));
    mkdirSync(join(root, 'src/routes'), { recursive: true });
    writeTypecheckConfig(root);
    writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'shop', kind: 'app', prefix: 'shop' }));
    writeFileSync(
      join(root, 'src/routes/index.fud'),
      `<link rel="layout" href="./_layout.fud">\n@code {\n  import { signal } from "@fudic/core";\n  const n = signal(0);\n  function more() {\n    n.set(n() + 1);\n  }\n}\n<head>\n<title>Shop</title>\n</head>\n${'<p>A paragraph long enough to be worth compressing.</p>\n'.repeat(40)}<button @click=@more()>@n()</button>\n`,
    );
    writeFileSync(
      join(root, 'src/routes/_layout.fud'),
      '<!DOCTYPE html>\n<html lang="en">\n<head>@RenderHead()</head>\n<body>@RenderBody()</body>\n</html>\n',
    );
    const config = { root, logLevel: 'silent' as const, resolve: { alias: { ...runtimeAlias } }, plugins: [fudic({ liveCheck: false })], preview: { port: 0 } };
    await build({ ...config, build: { minify: false } });
    dist = join(root, 'dist');
    server = await preview(config);
    port = (server.httpServer.address() as AddressInfo).port;
  }, 240000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  });

  it('the page, with brotli and Vary: Accept-Encoding', async () => {
    const page = await get(port, '/');
    expect(page.status).toBe(200);
    expect(page.headers['content-encoding']).toBe('br');
    expect(page.headers['vary']).toMatch(/accept-encoding/iu);
    expect(brotliDecompressSync(page.body).toString('utf8')).toContain('<title>Shop</title>');
  });

  it('a script of the build, served by Vite, with brotli and not Vite’s own gzip', async () => {
    const scripts = readdirSync(join(dist, 'assets'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .map((entry) => join(entry.parentPath, entry.name));
    const biggest = scripts.toSorted((a, b) => statSync(b).size - statSync(a).size)[0]!;
    expect(statSync(biggest).size).toBeGreaterThan(1024);
    const path = `/${biggest.slice(dist.length + 1).replace(/\\/gu, '/')}`;
    const file = await get(port, path);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/javascript/u);
    expect(file.headers['content-encoding']).toBe('br');
    expect(file.headers['vary']).toMatch(/accept-encoding/iu);
    expect(brotliDecompressSync(file.body).length).toBe(statSync(biggest).size);
  });
});
