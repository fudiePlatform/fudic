/**
 * SDD-87 (§8.2, the preview of an app under a `base`): the shared runtime belongs to the origin
 * (SDD-45 §4.2), so its URLs are `/_fudic/<version>/…` whatever the app's `base`. A host fuses
 * every app's `_fudic/` at its root; `vite preview` serves one app, and under a `base` answers
 * those URLs from the build's own copy. Only a piece of the runtime, only a file that is there,
 * never a file outside `_fudic/`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { originRuntime } from '../src/plugin.js';
import { runtimeAlias, writeTypecheckConfig } from './helpers/alias.js';

/** An `outDir` with `_fudic/0.0.1-abc/core/hydrate.js`, and a file beside `_fudic/` that must stay unread. */
function outDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-origin-runtime-'));
  mkdirSync(join(dir, '_fudic', '0.0.1-abc', 'core'), { recursive: true });
  writeFileSync(join(dir, '_fudic', '0.0.1-abc', 'core', 'hydrate.js'), 'export const hydrate = 1;');
  writeFileSync(join(dir, '_fudic', '0.0.1-abc', 'core', 'notes.txt'), 'not a piece');
  writeFileSync(join(dir, 'secret.js'), 'export const secret = 1;');
  return dir;
}

interface Answered {
  readonly next: boolean;
  readonly headers: Record<string, string>;
  readonly body?: string;
}

/** What the middleware does with `url`: answers it, or hands it on. */
function ask(dir: string, url: string | undefined): Answered {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  let next = false;
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    end: (chunk: Buffer) => {
      body = chunk.toString('utf8');
    },
  } as unknown as ServerResponse;
  originRuntime(dir)({ url } as IncomingMessage, res, () => {
    next = true;
  });
  return { next, headers, ...(body !== undefined ? { body } : {}) };
}

describe('originRuntime', () => {
  const dir = outDir();

  it('answers a piece of the runtime from <outDir>/_fudic/, as JavaScript, its query aside', () => {
    for (const url of ['/_fudic/0.0.1-abc/core/hydrate.js', '/_fudic/0.0.1-abc/core/hydrate.js?v=1']) {
      expect(ask(dir, url)).toEqual({ next: false, headers: { 'content-type': 'text/javascript; charset=utf-8' }, body: 'export const hydrate = 1;' });
    }
  });

  it('hands on anything that is not a piece’s URL', () => {
    for (const url of ['/admin/_fudic/0.0.1-abc/core/hydrate.js', '/_fudic/0.0.1-abc/core/notes.txt', '/_fudicx/a.js', '/', undefined]) {
      expect(ask(dir, url).next, String(url)).toBe(true);
    }
  });

  it('hands on a piece that is not there', () => {
    expect(ask(dir, '/_fudic/0.0.1-abc/core/missing.js').next).toBe(true);
  });

  it('never reads outside _fudic/, however the .. is written', () => {
    for (const url of ['/_fudic/../secret.js', '/_fudic/%2e%2e/secret.js', '/_fudic/0.0.1-abc/..%2f..%2fsecret.js', '/_fudic/..%5csecret.js']) {
      const answered = ask(dir, url);
      expect(answered.next, url).toBe(true);
      expect(answered).not.toHaveProperty('body');
    }
  });
});

/**
 * A piece of the runtime in the build, where a build that links it from `node_modules` publishes
 * it. This one bundles the runtime through aliases, so the piece is written here, after the build.
 */
function publishPiece(dist: string): string {
  mkdirSync(join(dist, '_fudic', '0.0.1-abc', 'core'), { recursive: true });
  writeFileSync(join(dist, '_fudic', '0.0.1-abc', 'core', 'hydrate.js'), 'export const hydrate = 1;');
  return '/_fudic/0.0.1-abc/core/hydrate.js';
}

describe.each([
  ['/admin/', 200],
  ['/', 200],
] as const)('vite preview under base %s', (base, status) => {
  let server: PreviewServer;
  let origin = '';
  let piece = '';

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-origin-runtime-app-'));
    mkdirSync(join(root, 'src/routes'), { recursive: true });
    writeTypecheckConfig(root);
    writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'admin', kind: 'app', prefix: 'adm' }));
    writeFileSync(
      join(root, 'src/routes/index.fud'),
      '<!DOCTYPE html>\n<html lang="es">\n<head>\n<title>i</title>\n@code {\n  import { signal } from "@fudic/core";\n  const n = signal(0);\n  function more() {\n    n.set(n() + 1);\n  }\n}\n</head>\n<body><button @click=@more()>@n()</button></body>\n</html>\n',
    );
    const config = { root, base, logLevel: 'silent' as const, resolve: { alias: { ...runtimeAlias } }, plugins: [fudic({ liveCheck: false })], preview: { port: 0 } };
    await build({ ...config, build: { minify: false } });
    piece = publishPiece(join(root, 'dist'));
    server = await preview(config);
    origin = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
  }, 240000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  });

  it('the runtime at the origin’s /_fudic/, where its pages ask for it', async () => {
    const res = await fetch(`${origin}${piece}`);
    expect(res.status).toBe(status);
    expect(res.headers.get('content-type')).toMatch(/javascript/u);
  });
});
