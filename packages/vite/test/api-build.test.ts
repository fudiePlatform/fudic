/**
 * SDD-60 in a real `vite build` and `vite preview`: a route declares its server in a `.fudapi`,
 * `src/server` implements it with `.handle`, and nobody walks that code to find it.
 *
 * - Criterion 26: the mode and the strategy come from the `load` line; `paths` enumerates.
 * - Criteria 15, 36, 37: the function answers at `/_fudic/fn/<id>/<name><route>`, with the
 *   page's params, its route, its query and its body, each typed, and what `auth` adds.
 * - Criterion 16: without `.handle`, a 404 — with no `detail` in a build.
 * - SDD-67: every call by hand in `fud-bin`, signed with the canonical text of its §4.3.
 * - Criterion 19: an error in a handler names the `.ts` of `src/server` and its line.
 * - Criterion 20: Oxc never reads `src/server` nor `src/browser` (a spy on the parser).
 * - Criterion 21: nothing of `src/server` reaches the client bundle.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { binInit, binProblem, binValue, type Ty } from './helpers/fud-bin.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

/** Every source the compiler handed Oxc, for criterion 20. */
const parsed = vi.hoisted(() => [] as string[]);
/** `oxc-parser` as the compiler resolves it: this package has none of its own. */
const OXC = vi.hoisted(() =>
  process
    .getBuiltinModule('node:module')
    .createRequire(new URL('../../compiler/package.json', import.meta.url))
    .resolve('oxc-parser'),
);
vi.mock(OXC, async (original) => {
  const oxc = await original<{ parseSync: (name: string, source: string, options?: never) => unknown }>();
  return {
    ...oxc,
    parseSync: (name: string, source: string, options?: unknown) => {
      parsed.push(source);
      return oxc.parseSync(name, source, options as never);
    },
  };
});

const BLOG_API = `# The posts, written at build time.
load ssg
  title  str

paths

# Saves a post: its id in the route, notify in the query, active in the body.
put save /:id
  use auth
  query notify bool
  id      i32
  active  bool
  -> Saved

get boom
  -> str

get nobody

type Saved
  slug    str
  id      i32
  notify  bool
  active  bool
  user    str
`;

const BLOG = `<!DOCTYPE html>
<html>
<head><title>Blog</title><link rel="server" href="./[slug].fudapi"></head>
<body><h1>@data.title</h1></body>
</html>
`;

const PLAIN_API = `load ssr ttl 5m cache-first
  n  i32
`;

const PLAIN = `<!DOCTYPE html>
<html>
<head><title>Plain</title><link rel="server" href="./plain.fudapi"></head>
<body><p>n = @data.n</p></body>
</html>
`;

const AUTH_API = `middleware auth
  server
  adds
    user  str
`;

const BLOG_SERVER = `import { load, paths, save, boom } from 'fudic:routes/blog/[slug]';
import { SECRET } from './secret';

load.handle((ctx) => ({ title: \`post \${ctx.params.slug} \${SECRET.length}\` }));
paths.handle(() => ['hola', 'adios']);
save.handle((ctx) => ({ slug: ctx.params.slug, id: ctx.params.id, notify: ctx.query.notify, active: ctx.args.active, user: ctx.user }));
boom.handle(() => {
  throw new Error('BOOM_MARK');
});
`;

const AUTH_SERVER = `import { auth } from 'fudic:middlewares/auth';
auth.server((ctx, next) => next(Object.assign(ctx, { user: ctx.headers.get('x-user') ?? 'nadie' })));
`;

const PLAIN_SERVER = `import { load } from 'fudic:routes/plain';
load.handle(() => ({ n: 7 }));
`;

function project(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-api-build-'));
  writeHttpTypecheckConfig(root, { module: 'esnext', moduleResolution: 'bundler', verbatimModuleSyntax: true, strict: true });
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
  plugins: [fudic()],
  build: { minify: false },
  preview: { port: 0 },
});

function filesUnder(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [{ path, text: readFileSync(path, 'utf8') }];
  });
}

let root: string;
let server: PreviewServer;
let origin: string;

beforeAll(async () => {
  root = project({
    'src/routes/blog/[slug].fudapi': BLOG_API,
    'src/routes/blog/[slug].fud': BLOG,
    'src/routes/plain.fudapi': PLAIN_API,
    'src/routes/plain.fud': PLAIN,
    'src/middlewares/auth.fudapi': AUTH_API,
    'src/server/blog.ts': BLOG_SERVER,
    'src/server/secret.ts': "export const SECRET = 'SERVER_SECRET_MARK';\n",
    'src/server/auth.ts': AUTH_SERVER,
    'src/server/plain.ts': PLAIN_SERVER,
  });
  await build(config(root));
  server = await preview(config(root));
  origin = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
}, 300000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
});

describe('criterion 26: the mode of a route, from its .fudapi', () => {
  it('ssg with paths: one page per entry, rendered with what load returned', () => {
    expect(readFileSync(join(root, 'dist/blog/hola/index.html'), 'utf8')).toContain('<h1>post hola 18</h1>');
    expect(existsSync(join(root, 'dist/blog/adios/index.html'))).toBe(true);
  });

  it('ssr, read off the load line: no page written at build time', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'dist/fudic-routes.json'), 'utf8')) as {
      routes: { pattern: string; mode: string }[];
    };
    expect(manifest.routes.find((r) => r.pattern === '/plain')!.mode).toBe('ssr');
    expect(existsSync(join(root, 'dist/plain/index.html'))).toBe(false);
  });

  it('an ssr page renders on request, its load from the registry', async () => {
    const html = await (await fetch(`${origin}/plain`, { headers: { accept: 'text/html' } })).text();
    expect(html).toContain('n = 7');
  });
});

describe('the functions, served by preview from functions.mjs, in fud-bin', () => {
  const call = (path: string, init: RequestInit = {}) =>
    fetch(`${origin}/_fudic/fn/${path}`, init);
  const SAVED: Ty = { fields: () => ({ slug: 'str', id: 'i32', notify: 'bool', active: 'bool', user: 'str' }) };
  /** The canonical texts of SDD-67 §4.3, written by hand. */
  const SAVE = 'route(id:i32)|query(notify:bool)|body(active:bool)|->{slug:str,id:i32,notify:bool,active:bool,user:str}';
  const BOOM = 'route()|query()|body()|->str';
  const NOBODY = 'route()|query()|body()|->';

  it('criteria 15 and 36: params of the page and the route, query, body and what auth adds', async () => {
    const response = await call(
      'routes/blog/hola/save/42?notify=true',
      binInit(SAVE, { active: 'bool' }, { active: true }, { method: 'PUT', headers: { 'x-user': 'ana' } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/fud+bin');
    expect(await binValue(response, SAVED)).toEqual({ slug: 'hola', id: 42, notify: true, active: true, user: 'ana' });
  });

  it('criterion 8: the signature the build wrote is the one of the canonical text; another is a 412', async () => {
    const stale = await call('routes/blog/hola/save/42?notify=true', binInit(`${SAVE}x`, { active: 'bool' }, { active: true }, { method: 'PUT' }));
    expect(stale.status).toBe(412);
    expect((await binProblem(stale)).detail).toBe('the page is older than the server');
  });

  it('criterion 37: a value that is not of its type is a 400 naming it', async () => {
    const response = await call('routes/blog/hola/save/abc?notify=true', binInit(SAVE, { active: 'bool' }, { active: true }, { method: 'PUT' }));
    expect(response.status).toBe(400);
    expect((await binProblem(response)).detail).toBe('argument id is not a valid i32');
  });

  it('criterion 16: a function nobody implemented is a 404 without detail', async () => {
    const response = await call('routes/blog/hola/nobody', binInit(NOBODY));
    expect(response.status).toBe(404);
    expect((await binProblem(response)).detail).toBeUndefined();
  });

  it('a 500 says nothing of the error in a build', async () => {
    const response = await call('routes/blog/hola/boom', binInit(BOOM));
    expect(response.status).toBe(500);
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    expect(new TextDecoder().decode(bytes)).not.toContain('BOOM_MARK');
    expect(await binProblem(response)).toEqual({ status: 500, title: 'Internal Server Error' });
  });
});

describe('criterion 19: sourcemaps of the server bundle', () => {
  it('a throw in a handler names src/server/blog.ts and its line', async () => {
    const edge = join(root, '.fudic/edge');
    const mod = (await import(pathToFileURL(join(edge, 'fudic-root.js')).href)) as {
      handler: (o: object) => (r: Request) => Promise<Response | null>;
    };
    const errors: unknown[] = [];
    const response = await mod.handler({ onError: (e: unknown) => errors.push(e) })(
      new Request('http://x/_fudic/fn/routes/blog/hola/boom', binInit('route()|query()|body()|->str')),
    );
    expect(response!.status).toBe(500);
    expect((errors[0] as Error).stack).toMatch(/src[\\/]server[\\/]blog\.ts:8/u);
  });
});

describe('criteria 20 and 21: nobody reads the handlers, and the browser never gets them', () => {
  it('Oxc was never handed a file of src/server', () => {
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.some((source) => source.includes('SERVER_SECRET_MARK') || source.includes('BOOM_MARK'))).toBe(false);
  });

  it('the client output holds nothing of src/server', () => {
    const client = filesUnder(join(root, 'dist')).map((f) => f.text).join('\n');
    expect(client).not.toContain('SERVER_SECRET_MARK');
    expect(client).not.toContain('BOOM_MARK');
  });
});
