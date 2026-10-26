/**
 * SDD-60 in a real Vite dev server: the root is loaded the first time a request needs it, the
 * types are written at start, an edit of a handler is seen without a restart, and the errors of
 * the registry go to the overlay.
 *
 * - Criterion 16: without `.handle`, a 404 whose `detail` names the function, the `<id>` and the
 *   folder.
 * - Criterion 17: two implementations of one piece answer 500 and reach the overlay.
 * - Criterion 22: with `"server": "src/backend"`, that folder answers and `src/server` is not loaded.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

const API = `load ssr
  n  i32

get hello
  -> str

get nobody
`;

const PAGE = `<!DOCTYPE html>
<html>
<head><title>x</title><link rel="server" href="./home.fudapi"></head>
<body><p>n = @data.n</p></body>
</html>
`;

const DUP_API = `get twice
  -> str
`;

const handler = (text: string) =>
  `import { hello, load } from 'fudic:routes/home';\nload.handle(() => ({ n: 3 }));\nhello.handle(() => '${text}');\n`;

interface Running {
  readonly root: string;
  readonly server: ViteDevServer;
  readonly origin: string;
  readonly sent: unknown[];
}

async function start(files: Readonly<Record<string, string>>): Promise<Running> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-api-dev-'));
  writeHttpTypecheckConfig(root);
  for (const [path, text] of Object.entries({ 'src/routes/home.fudapi': API, 'src/routes/home.fud': PAGE, ...files })) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic({ liveCheck: false })],
    server: { port: 0 },
  });
  await server.listen();
  const sent: unknown[] = [];
  const send = server.ws.send.bind(server.ws);
  server.ws.send = ((payload: unknown) => {
    sent.push(payload);
    send(payload as never);
  }) as typeof server.ws.send;
  return { root, server, origin: `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`, sent };
}

let app: Running;
let moved: Running;

beforeAll(async () => {
  [app, moved] = await Promise.all([
    start({
      'src/routes/dup.fudapi': DUP_API,
      'src/server/home.ts': handler('hola'),
      'src/server/dup-a.ts': "import { twice } from 'fudic:routes/dup';\ntwice.handle(() => 'a');\n",
    }),
    start({
      'fudic.json': JSON.stringify({ server: 'src/backend' }),
      'src/backend/home.ts': handler('from backend'),
      'src/server/home.ts': "throw new Error('src/server is not loaded');\n",
    }),
  ]);
}, 180000);

afterAll(async () => {
  await Promise.all([app.server.close(), moved.server.close()]);
});

describe('the functions of a .fudapi in dev', () => {
  it('the types of fudic:<id> are on disk once the server starts', () => {
    expect(readFileSync(join(app.root, '.fudic/api/routes/home.d.ts'), 'utf8')).toContain('declare module "fudic:routes/home"');
  });

  it('a function answers, and the page renders its load', async () => {
    expect(await (await fetch(`${app.origin}/_fudic/fn/routes/home/hello`)).json()).toBe('hola');
    const html = await (await fetch(`${app.origin}/home`, { headers: { accept: 'text/html' } })).text();
    expect(html).toContain('n = 3');
  });

  it('a contract of the browser brings the browser root, served at its own URL', async () => {
    const contract = await (await fetch(`${app.origin}/@id/fudic:routes/home`)).text();
    expect(contract).toContain('import "/fudic-root.browser.js";');
    const browserRoot = await (await fetch(`${app.origin}/fudic-root.browser.js`)).text();
    expect(browserRoot).toContain('the implementations of the browser');
    expect(browserRoot).not.toContain('/src/server/');
  });

  it('criterion 16: without .handle, a 404 that says what is missing', async () => {
    const response = await fetch(`${app.origin}/_fudic/fn/routes/home/nobody`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { detail?: string }).detail).toBe('nobody of routes/home has no implementation in src/server');
  });

  it('an edit of a handler is seen by the next request', async () => {
    writeFileSync(join(app.root, 'src/server/home.ts'), handler('editado'));
    await expect.poll(async () => (await fetch(`${app.origin}/_fudic/fn/routes/home/hello`)).json(), { timeout: 20000 }).toBe('editado');
  });

  it('criterion 17: two implementations of one piece fail the request and reach the overlay', async () => {
    writeFileSync(join(app.root, 'src/server/dup-b.ts'), "import { twice } from 'fudic:routes/dup';\ntwice.handle(() => 'b');\n");
    await app.server.watcher.emit('add', join(app.root, 'src/server/dup-b.ts'));
    await expect
      .poll(async () => (await fetch(`${app.origin}/_fudic/fn/routes/dup/twice`)).status, { timeout: 20000 })
      .toBe(500);
    const text = await (await fetch(`${app.origin}/_fudic/fn/routes/dup/twice`)).text();
    expect(text).toContain('twice of routes/dup is implemented twice: src/server/dup-a.ts, src/server/dup-b.ts');
  });

  it('a new .fudapi rewrites the types and is served', async () => {
    writeFileSync(join(app.root, 'src/routes/extra.fudapi'), 'get ping\n  -> str\n');
    app.server.watcher.emit('add', join(app.root, 'src/routes/extra.fudapi'));
    expect(existsSync(join(app.root, '.fudic/api/routes/extra.d.ts'))).toBe(true);
    expect(app.sent).toContainEqual({ type: 'full-reload', path: '*' });
  });
});

describe('criterion 22: the folder fudic.json names', () => {
  it('src/backend answers, and src/server is never loaded', async () => {
    expect(await (await fetch(`${moved.origin}/_fudic/fn/routes/home/hello`)).json()).toBe('from backend');
    const response = await fetch(`${moved.origin}/_fudic/fn/routes/home/nobody`);
    expect(((await response.json()) as { detail?: string }).detail).toBe('nobody of routes/home has no implementation in src/backend');
  });
});
