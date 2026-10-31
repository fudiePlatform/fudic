/**
 * SDD-69 §4.2, §4.4 and criteria 10–13 and 17, in a real dev server, a real `vite build` and
 * `vite preview`: what `load` writes in `ctx.response` reaches the browser — its status, its
 * headers, every `Set-Cookie` — in the page, in its data endpoint and in the error page it
 * threw to; what read the session goes out `private, no-store`; and a prerender that reads the
 * session fails the build with `FUD1300`.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, createServer, preview, type PreviewServer, type Rollup, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const NODE_TYPES = fileURLToPath(new URL('../node_modules/@types', import.meta.url));

/** A route with a `.fudapi` of one `load` and its handler's body. */
const route = (name: string, line: string, body: string): Record<string, string> => ({
  [`src/routes/${name}.fud`]: `<!DOCTYPE html>
<html>
<head>
<title>x</title>
<link rel="server" href="./${name}.fudapi">
</head>
<body><p>n: @data.n</p></body>
</html>
`,
  [`src/routes/${name}.fudapi`]: `${line}\n  n  i32\n`,
  [`src/server/${name}.ts`]: `import { deleteCookie, setCookie, unauthorized } from '@fudic/http';
import { load } from 'fudic:routes/${name}';

load.handle(async (ctx): Promise<{ n: number }> => {
  ${body}
});
`,
});

const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body><h1>status @data.status</h1></body>
</html>
`;

/** Two cookies, a status, two headers fudic owns, and a read of the session. */
const WRITES = `setCookie(ctx, 'a', '1');
  setCookie(ctx, 'b', '2');
  ctx.response.status = 203;
  ctx.response.headers.set('content-type', 'text/plain');
  ctx.response.headers.set('content-security-policy', 'default-src *');
  ctx.response.headers.set('x-load', 'yes');
  ctx.cookies.get('sid');
  return { n: 1 };`;

const FILES = {
  ...route('writes', 'load ssr', WRITES),
  ...route('out', 'load ssr', "deleteCookie(ctx, 'sid');\n  throw unauthorized();"),
  ...route('plain', 'load ssr', 'return { n: 2 };'),
  'src/routes/_error.fud': ERROR_PAGE,
  'sw.json': JSON.stringify({ shell: [] }),
  'fudic.json': JSON.stringify({ id: 'test' }),
};

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-session-'));
  writeHttpTypecheckConfig(root, {
    module: 'esnext',
    moduleResolution: 'bundler',
    verbatimModuleSyntax: true,
    typeRoots: [NODE_TYPES],
    types: ['node'],
  });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const config = (root: string) => ({
  root,
  logLevel: 'silent' as const,
  resolve: { alias: httpAlias },
  plugins: [fudic({ liveCheck: false })],
  build: { minify: false },
  preview: { port: 0 },
  server: { port: 0 },
});

let dev: ViteDevServer;
let devOrigin: string;
let served: PreviewServer;
let previewOrigin: string;

beforeAll(async () => {
  const devRoot = project(FILES);
  dev = await createServer(config(devRoot));
  await dev.listen();
  devOrigin = `http://localhost:${(dev.httpServer!.address() as AddressInfo).port}`;
  await fetch(`${devOrigin}/_fudic/data/plain`);

  const previewRoot = project(FILES);
  await build(config(previewRoot));
  served = await preview(config(previewRoot));
  previewOrigin = `http://localhost:${(served.httpServer.address() as AddressInfo).port}`;
}, 240000);

afterAll(async () => {
  await dev.close();
  await new Promise<void>((resolve) => served.httpServer.close(() => resolve()));
});

const page = (origin: string, path: string) => fetch(`${origin}${path}`, { headers: { accept: 'text/html' }, redirect: 'manual' });

describe.each([
  ['dev', () => devOrigin],
  ['preview', () => previewOrigin],
])('in %s', (where, originOf) => {
  it('criterion 10: the page answers with what load wrote; Content-Type and CSP are fudic’s', async () => {
    const res = await page(originOf(), '/writes');
    expect(res.status).toBe(203);
    expect(res.headers.getSetCookie()).toEqual(['a=1; Path=/; HttpOnly; SameSite=Lax', 'b=2; Path=/; HttpOnly; SameSite=Lax']);
    expect(res.headers.get('x-load')).toBe('yes');
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const csp = res.headers.get('content-security-policy');
    // In dev fudic sends none, so that the HMR client lives; in preview, its own with a nonce.
    if (where === 'dev') expect(csp).toBeNull();
    else expect(csp).toMatch(/nonce-/u);
    expect(await res.text()).toContain('n: 1');
  });

  it('criterion 11: the data endpoint, the same Set-Cookie and status', async () => {
    const res = await fetch(`${originOf()}/_fudic/data/writes`);
    expect(res.status).toBe(203);
    expect(res.headers.getSetCookie()).toHaveLength(2);
    expect(res.headers.get('content-type')).toBe('application/fud+frames');
  });

  it('criterion 12: deleteCookie then unauthorized is the error page, with the Set-Cookie', async () => {
    const res = await page(originOf(), '/out');
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual(['sid=; Path=/; Max-Age=0']);
    expect(await res.text()).toContain('status 401');
    const data = await fetch(`${originOf()}/_fudic/data/out`);
    expect(data.status).toBe(401);
    expect(data.headers.getSetCookie()).toEqual(['sid=; Path=/; Max-Age=0']);
  });

  it('criterion 13: a load that reads the session is private, in the page and in its data', async () => {
    expect((await page(originOf(), '/writes')).headers.get('cache-control')).toBe('private, no-store');
    expect((await fetch(`${originOf()}/_fudic/data/writes`)).headers.get('cache-control')).toBe('private, no-store');
    expect((await page(originOf(), '/plain')).headers.get('cache-control')).toBeNull();
    expect((await fetch(`${originOf()}/_fudic/data/plain`)).headers.get('cache-control')).toBeNull();
  });
});

describe('criterion 17: a prerender that reads the session', () => {
  const READS = "ctx.cookies.get('sid');\n  return { n: 1 };";

  it('load ssg that reads ctx.cookies is FUD1300 on its load, and the build fails', async () => {
    const r = project({ ...route('cuenta', 'load ssg', READS), 'fudic.json': JSON.stringify({ id: 'test' }) });
    await expect(build({ ...config(r), build: { minify: false, write: false } })).rejects.toThrow(
      /cuenta\.fudapi:1:1 - error FUD1300: the prerender of \/cuenta reads the session/u,
    );
  }, 240000);

  it('the same with load ssr, nothing; an ssg that reads nothing is prerendered as today', async () => {
    const r = project({
      ...route('cuenta', 'load ssr', READS),
      ...route('about', 'load ssg', 'return { n: 7 };'),
      'fudic.json': JSON.stringify({ id: 'test' }),
    });
    const out = (await build({ ...config(r), build: { minify: false, write: false } })) as Rollup.RollupOutput;
    const html = out.output.find((o) => o.fileName === 'about/index.html');
    expect(html?.type === 'asset' ? String(html.source) : '').toContain('n: 7');
    expect(out.output.some((o) => o.fileName === 'cuenta/index.html')).toBe(false);
  }, 240000);
});
