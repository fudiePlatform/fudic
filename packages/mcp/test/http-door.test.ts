/**
 * The door of the preview on the MCP's own port (SDD-78 §4.3, criterion 9): `/mcp/<secret>` is
 * still the MCP; `/_fudic/preview/<secret>` gives the cookie and sends on; everything else is the
 * app, only with the cookie — HMR's upgrades too. The app is a stand-in here.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer as createNetServer, type Socket } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import type { DevServer, DevState } from '../src/dev-server.js';
import { cookieValue, shotsPath } from '../src/gate.js';
import { startHttp, type HttpEntry } from '../src/http.js';
import { createServer } from '../src/server.js';
import { fakeProject, tempDir } from './helpers.js';

const SECRET = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const COOKIE = `fudic-preview=${cookieValue(SECRET)}`;
const entries: HttpEntry[] = [];

afterEach(async () => {
  await Promise.all(entries.splice(0).map((e) => e.close()));
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

/** An app that answers what it was handed, and takes WebSockets. */
class FakeApp {
  state: DevState = 'ready';
  readyState: DevState = 'ready';
  failure = 'port in use';
  readonly cookies: (string | undefined)[] = [];
  readonly upgrades: string[] = [];

  async ready(): Promise<DevState> {
    return this.readyState;
  }

  handle(req: IncomingMessage, res: ServerResponse): void {
    this.cookies.push(req.headers.cookie);
    res.writeHead(200, { 'content-type': 'text/html' }).end(`<p>app ${req.url}</p>`);
  }

  upgrade(req: IncomingMessage, socket: Duplex): void {
    this.upgrades.push(req.headers.cookie ?? '');
    socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  }
}

async function start(app?: FakeApp): Promise<{ origin: string; app: FakeApp | undefined }> {
  const port = await freePort();
  const entry = await startHttp({
    port,
    secret: SECRET,
    create: () => createServer({ project: fakeProject(), entry: 'http' }),
    ...(app !== undefined ? { app: app as unknown as DevServer } : {}),
  });
  entries.push(entry);
  return { origin: `http://127.0.0.1:${port}`, app };
}

const get = (url: string, headers: Record<string, string> = {}): Promise<Response> => fetch(url, { headers: { accept: 'text/html', ...headers }, redirect: 'manual' });

/** Asks for a WebSocket; resolves the status line it got, or 'destroyed' when the socket was cut. */
function upgrade(origin: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve) => {
    const req = request(`${origin}/`, {
      headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers },
    });
    req.on('upgrade', (res: IncomingMessage, socket: Socket) => {
      socket.destroy();
      resolve(String(res.statusCode));
    });
    req.on('response', (res) => resolve(`response ${res.statusCode}`));
    req.on('error', () => resolve('destroyed'));
    req.end();
  });
}

describe('without an app', () => {
  it('everything that is not the MCP is a 404 with no body, the door included', async () => {
    const { origin } = await start();
    for (const path of ['/', `/_fudic/preview/${SECRET}`, '/productos']) {
      const res = await get(`${origin}${path}`, { cookie: COOKIE });
      expect(res.status, path).toBe(404);
      expect(await res.text()).toBe('');
    }
    expect(await upgrade(origin, { cookie: COOKIE })).toBe('destroyed');
  });
});

describe('with the app (criterion 9)', () => {
  it('without the cookie: 404 with no body, and the app never sees it', async () => {
    const { origin, app } = await start(new FakeApp());
    const res = await get(`${origin}/productos`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(app!.cookies).toEqual([]);
  });

  it('the door gives the cookie and sends to `to`; with it, the page — and the app never sees the cookie', async () => {
    const { origin, app } = await start(new FakeApp());
    const door = await get(`${origin}/_fudic/preview/${SECRET}?to=/productos`);
    expect(door.status).toBe(302);
    expect(door.headers.get('location')).toBe('/productos');
    expect(door.headers.get('set-cookie')).toBe(`${COOKIE}; Path=/; HttpOnly; SameSite=Lax`);

    const page = await get(`${origin}/productos`, { cookie: `${COOKIE}; theme=dark` });
    expect(page.status).toBe(200);
    expect(await page.text()).toBe('<p>app /productos</p>');
    expect(app!.cookies).toEqual(['theme=dark']);
  });

  it('the door over https sets a Secure cookie; with no `to`, or one off the site, it sends to /', async () => {
    const { origin } = await start(new FakeApp());
    const secure = await get(`${origin}/_fudic/preview/${SECRET}`, { 'x-forwarded-proto': 'https' });
    expect(secure.headers.get('set-cookie')).toMatch(/; Secure$/u);
    expect(secure.headers.get('location')).toBe('/');
    const away = await get(`${origin}/_fudic/preview/${SECRET}?to=//evil.example`);
    expect(away.headers.get('location')).toBe('/');
  });

  it('another secret: its door is no door, and its cookie opens nothing', async () => {
    const { origin, app } = await start(new FakeApp());
    expect((await get(`${origin}/_fudic/preview/${OTHER}?to=/`)).status).toBe(404);
    expect((await get(`${origin}/`, { cookie: `fudic-preview=${cookieValue(OTHER)}` })).status).toBe(404);
    expect(app!.cookies).toEqual([]);
  });

  it('an app that did not start: 503 saying why', async () => {
    const app = new FakeApp();
    app.readyState = 'failed';
    const { origin } = await start(app);
    const res = await get(`${origin}/`, { cookie: COOKIE });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('The preview did not start: port in use');
  });

  it('HMR: an upgrade with the cookie reaches the app, without it; any other is cut', async () => {
    const app = new FakeApp();
    const { origin } = await start(app);
    expect(await upgrade(origin, { cookie: `${COOKIE}; a=1` })).toBe('101');
    expect(app.upgrades).toEqual(['a=1']);
    expect(await upgrade(origin)).toBe('destroyed');
    expect(await upgrade(origin, { cookie: `fudic-preview=${cookieValue(OTHER)}` })).toBe('destroyed');
    app.state = 'starting';
    expect(await upgrade(origin, { cookie: COOKIE })).toBe('destroyed');
    expect(app.upgrades).toHaveLength(1);
  });

  it('/mcp/<secret> is still the MCP at the same time', async () => {
    const { origin } = await start(new FakeApp());
    const res = await fetch(`${origin}/mcp/${SECRET}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'curl', version: '0' } } }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"name":"fudic"');
  });
});

describe('the shots of .fudic, under a token of the secret', () => {
  async function withShots(): Promise<{ origin: string; shots: string; dispose(): void }> {
    const dir = tempDir({ 'secret.png': 'S' });
    const shotDir = join(dir.root, '.fudic/looks/acme-button/91c2');
    mkdirSync(shotDir, { recursive: true });
    writeFileSync(join(shotDir, 'primary.png'), 'PNG');
    writeFileSync(join(shotDir, 'notes.txt'), 'x');
    const port = await freePort();
    const entry = await startHttp({ port, secret: SECRET, root: dir.root, create: () => createServer({ project: fakeProject(), entry: 'http' }) });
    entries.push(entry);
    return { origin: `http://127.0.0.1:${port}`, shots: shotsPath(SECRET), dispose: () => dir.dispose() };
  }

  it('a PNG of the project: served with no cookie, cached for good, open to any origin', async () => {
    const { origin, shots, dispose } = await withShots();
    const res = await get(`${origin}${shots}looks/acme-button/91c2/primary.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.text()).toBe('PNG');
    dispose();
  });

  it('nothing else: another kind of file, one that is not there, a path out of .fudic', async () => {
    const { origin, shots, dispose } = await withShots();
    for (const path of ['looks/acme-button/91c2/notes.txt', 'looks/acme-button/91c2/nada.png', '..%2Fsecret.png', '']) {
      const res = await get(`${origin}${shots}${path}`);
      expect(res.status, path).toBe(404);
      expect(await res.text()).toBe('');
    }
    dispose();
  });

  it('the token is not the secret, and without a root nothing is served there', async () => {
    expect(shotsPath(SECRET)).not.toContain(SECRET);
    expect(shotsPath(SECRET)).toMatch(/^\/_fudic\/shots\/[0-9a-f]{32}\/$/u);
    expect(shotsPath(OTHER)).not.toBe(shotsPath(SECRET));
    const { origin } = await start();
    expect((await get(`${origin}${shotsPath(SECRET)}looks/x.png`)).status).toBe(404);
  });
});
