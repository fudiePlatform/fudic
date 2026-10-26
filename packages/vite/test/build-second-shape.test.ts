/**
 * A second build of the same project in another shape: `sw: false` and its own `edgeDir`.
 *
 * Since SDD-60 a project cannot be built from a second root that borrows the first one's
 * routes: its `.fudapi`, `src/server`, `src/browser` and dependencies are read from the root,
 * and none of them can be pointed outside it (§3.10, §3.15). So the second shape is the same
 * root built with two options: one that ignores `sw.json`, and one that sends the server
 * bundle elsewhere, because the preview of the first build reads `.fudic/edge` while the
 * second one runs beside it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic, type FudicOptions } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const PLAIN_API = `load ssr
  n  i32
`;

const PLAIN = `<!DOCTYPE html>
<html>
<head><title>Plain</title><link rel="server" href="./plain.fudapi"></head>
<body><p>n = @data.n</p></body>
</html>
`;

const PLAIN_SERVER = `import { load } from 'fudic:routes/plain';
load.handle(() => ({ n: 7 }));
`;

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-second-shape-'));
  writeHttpTypecheckConfig(root, { module: 'esnext', moduleResolution: 'bundler', verbatimModuleSyntax: true, strict: true });
  const files: Readonly<Record<string, string>> = {
    'sw.json': JSON.stringify({ shell: ['/fudic-main.js'] }),
    'fudic.json': JSON.stringify({ id: 'test' }),
    'src/routes/plain.fudapi': PLAIN_API,
    'src/routes/plain.fud': PLAIN,
    'src/server/plain.ts': PLAIN_SERVER,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const config = (root: string, outDir: string, options: FudicOptions = {}) => ({
  root,
  logLevel: 'silent' as const,
  resolve: { alias: httpAlias },
  plugins: [fudic(options)],
  build: { minify: false, outDir },
  preview: { port: 0 },
});

const SECOND: FudicOptions = { sw: false, edgeDir: '.fudic/edge-second' };

let root: string;
let first: PreviewServer;
let second: PreviewServer;

const originOf = (server: PreviewServer): string =>
  `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;

beforeAll(async () => {
  root = project();
  await build(config(root, 'dist'));
  await build(config(root, 'dist-second', SECOND));
  first = await preview(config(root, 'dist'));
  second = await preview(config(root, 'dist-second', SECOND));
}, 300000);

afterAll(async () => {
  for (const server of [first, second]) {
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  }
});

describe('sw: false', () => {
  it('the default build reads sw.json and emits the worker', () => {
    expect(existsSync(join(root, 'dist/fudic-sw.js'))).toBe(true);
  });

  it('the second build ignores it: no worker, no registration in the manifest', () => {
    expect(existsSync(join(root, 'dist-second/fudic-sw.js'))).toBe(false);
    expect(readFileSync(join(root, 'dist-second/fudic-routes.json'), 'utf8')).not.toContain('fudic-sw.js');
  });
});

describe('edgeDir', () => {
  it('each build writes its own server bundle, and the second leaves the first alone', () => {
    expect(existsSync(join(root, '.fudic/edge/fudic-root.js'))).toBe(true);
    expect(existsSync(join(root, '.fudic/edge-second/fudic-root.js'))).toBe(true);
  });

  it('each preview renders from its own bundle', async () => {
    const page = async (server: PreviewServer) =>
      (await fetch(`${originOf(server)}/plain`, { headers: { accept: 'text/html' } })).text();
    expect(await page(first)).toContain('n = 7');
    // With the first bundle gone, only a preview that reads its own can still render.
    rmSync(join(root, '.fudic/edge'), { recursive: true, force: true });
    expect(await page(second)).toContain('n = 7');
  });
});
