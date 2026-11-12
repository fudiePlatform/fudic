/**
 * SDD-82 §4.7 in a real `vite build` and `vite preview`: a build made with the workbench's hooks
 * installed is the bench's own — a request that carries a criterion's cookie gets the fixture's
 * `data`, painted on demand and never the prerendered file, the answers of its functions, and its
 * clock in the server's `Date`; its edge goes beside its `outDir`, not where the app's own preview
 * reads it. A build made without the bench is the app as it always is, whatever cookie comes.
 */

import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { createBench, fudic, installBench, type Bench } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const HTTP_PACKAGE = fileURLToPath(new URL('../../http', import.meta.url));

const FILES: Readonly<Record<string, string>> = {
  'src/http.fudapi': 'chain\n  use json\n',
  'src/routes/usuarios.fud': `<!DOCTYPE html>
<html>
<head><title>Usuarios</title><link rel="server" href="./usuarios.fudapi"></head>
<body><h1>@data.title</h1></body>
</html>
`,
  'src/routes/usuarios.fudapi': `load
  title  str

get search
  q  str
  -> str[]

get clock
  -> str
`,
  'src/server/usuarios.ts': `import { load, search, clock } from 'fudic:routes/usuarios';

load.handle(() => ({ title: 'de verdad' }));
search.handle(() => ['real']);
clock.handle(() => new Date().toISOString());
`,
  'fudic.json': JSON.stringify({ id: 'bench-build' }),
};

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fudic-bench-build-'));
  writeHttpTypecheckConfig(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@fudic/http': '0.0.0' } }));
  mkdirSync(join(root, 'node_modules', '@fudic'), { recursive: true });
  symlinkSync(HTTP_PACKAGE, join(root, 'node_modules', '@fudic', 'http'), 'junction');
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
});

/** The app built into `out` and served as `vite preview` serves it. */
async function builtAndServed(out: string): Promise<{ server: PreviewServer; origin: string }> {
  const config = { root, logLevel: 'silent' as const, resolve: { alias: httpAlias }, plugins: [fudic({ liveCheck: false })], build: { outDir: out } };
  await build(config);
  const server = await preview({ ...config, preview: { port: 0, host: '127.0.0.1' } });
  return { server, origin: `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}` };
}

const COOKIE = { cookie: 'fudic-bench=run.c1' };
const page = (origin: string, headers: Record<string, string> = {}) => fetch(`${origin}/usuarios`, { headers: { accept: 'text/html', ...headers } });
const fn = (origin: string, name: string, query = '') =>
  fetch(`${origin}/_fudic/fn/routes/usuarios/${name}${query}`, { headers: { accept: 'application/json', ...COOKIE } });

describe('the workbench’s own build (SDD-82 §4.7)', () => {
  let bench: Bench;
  let uninstall: () => void;
  let served: { server: PreviewServer; origin: string };
  const out = () => join(root, 'bench-out', 'dist');

  beforeAll(async () => {
    bench = createBench();
    uninstall = installBench(bench);
    served = await builtAndServed(out());
    bench.begin('run.c1', { route: 'routes/usuarios', data: [{ title: 'de la fixture' }], answers: { search: ['luis'] }, clock: Date.parse('2026-11-08T10:00:00Z') });
  }, 180_000);

  afterAll(async () => {
    await served.server.close();
    uninstall();
  });

  it('paints a criterion’s page on demand with its data; without the cookie, the page as built', async () => {
    expect(await (await page(served.origin, COOKIE)).text()).toContain('de la fixture');
    expect(await (await page(served.origin)).text()).toContain('de verdad');
  });

  it('answers its functions with the fixture, logs them, and reads its clock', async () => {
    const q = `?a=${encodeURIComponent(JSON.stringify({ q: 'l' }))}`;
    expect(await (await fn(served.origin, 'search', q)).json()).toEqual(['luis']);
    expect(await (await fn(served.origin, 'clock')).json()).toBe('2026-11-08T10:00:00.000Z');
    expect(bench.calls('run.c1').map((c) => [c.name, c.faked])).toEqual([
      ['search', true],
      ['clock', false],
    ]);
  });

  it('writes its edge beside its outDir, not where the app’s own preview reads it', () => {
    expect(existsSync(join(root, 'bench-out', 'edge', 'server.mjs'))).toBe(true);
    expect(existsSync(join(root, '.fudic', 'edge', 'server.mjs'))).toBe(false);
  });
});

describe('any other build', () => {
  it('ignores the cookie: the page and the functions are the app’s', async () => {
    const served = await builtAndServed(join(root, 'dist'));
    try {
      const bench = createBench();
      const uninstall = installBench(bench);
      try {
        // Even served by a process with the bench installed: the build is not the bench's.
        bench.begin('run.c1', { route: 'routes/usuarios', data: [{ title: 'de la fixture' }], answers: { search: ['luis'] } });
        expect(await (await page(served.origin, COOKIE)).text()).toContain('de verdad');
        expect(await (await fn(served.origin, 'search', `?a=${encodeURIComponent(JSON.stringify({ q: 'l' }))}`)).json()).toEqual(['real']);
        expect(bench.calls('run.c1')).toEqual([]);
      } finally {
        uninstall();
      }
    } finally {
      await served.server.close();
    }
  }, 180_000);
});
