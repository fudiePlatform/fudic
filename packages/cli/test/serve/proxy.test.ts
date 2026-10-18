/**
 * BUG-50 §4.5, §6.9 — the one port: a real proxy in front of real HTTP servers on port 0, each
 * one answering with its own name, as each app's Vite would.
 */

import { createServer, request, type IncomingMessage, type Server } from 'node:http';
import { connect, createServer as createNetServer, type AddressInfo, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createProxy, type Backend } from '../../src/serve/proxy.js';

const open: Server[] = [];
const sockets = new Set<Socket>();

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  for (const server of open.splice(0)) {
    await new Promise((resolve) => server.close(resolve));
  }
});

function listening<T extends Server>(server: T): Promise<number> {
  open.push(server);
  server.on('connection', (socket: Socket) => sockets.add(socket));
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
}

/** An app: answers `<name> <method> <url> <body>`, and 404 for what `missing` says. */
async function backend(name: string, missing: (url: string) => boolean = () => false): Promise<number> {
  return listening(
    createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        const url = req.url ?? '';
        res.writeHead(missing(url) ? 404 : 200, { 'x-app': name });
        res.end(`${name} ${req.method} ${url} ${body}`.trim());
      });
    }),
  );
}

/** A port nothing listens on. */
async function closedPort(): Promise<number> {
  const probe = createNetServer();
  const port = await new Promise<number>((resolve) => probe.listen(0, '127.0.0.1', () => resolve((probe.address() as AddressInfo).port)));
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

interface Answer {
  readonly status: number;
  readonly headers: IncomingMessage['headers'];
  readonly body: string;
}

function ask(port: number, path: string, method = 'GET', body?: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let text = '';
      res.on('data', (chunk: Buffer) => (text += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function proxy(backends: readonly Backend[]): Promise<number> {
  return listening(createProxy(backends));
}

describe('createProxy', () => {
  it('sends each request to the app with the longest base it starts with', async () => {
    const front = await proxy([
      { base: '/', port: await backend('web') },
      { base: '/admin/', port: await backend('admin') },
    ]);
    expect((await ask(front, '/')).body).toBe('web GET /');
    expect((await ask(front, '/about?x=1')).body).toBe('web GET /about?x=1');
    expect((await ask(front, '/admin/')).body).toBe('admin GET /admin/');
    expect((await ask(front, '/admin/users')).headers['x-app']).toBe('admin');
    expect((await ask(front, '/administrator')).body).toBe('web GET /administrator');
  });

  it('sends /admin to /admin/, keeping the query', async () => {
    const front = await proxy([{ base: '/admin/', port: await backend('admin') }]);
    const answer = await ask(front, '/admin?tab=2');
    expect(answer.status).toBe(301);
    expect(answer.headers.location).toBe('/admin/?tab=2');
  });

  it('passes the method and the body through', async () => {
    const front = await proxy([{ base: '/', port: await backend('web') }]);
    expect((await ask(front, '/api/save', 'POST', 'hello')).body).toBe('web POST /api/save hello');
  });

  it('asks each app for the runtime until one has it', async () => {
    const front = await proxy([
      { base: '/', port: await backend('web') },
      { base: '/admin/', port: await backend('admin', (url) => url.startsWith('/_fudic/')) },
    ]);
    // `admin` has the longer base, so it is asked first; it has no runtime, so `web` answers.
    expect((await ask(front, '/_fudic/runtime.js')).body).toBe('web GET /_fudic/runtime.js');
  });

  it('answers the last app\'s 404 when none has it', async () => {
    const front = await proxy([
      { base: '/', port: await backend('web', () => true) },
      { base: '/admin/', port: await backend('admin', () => true) },
    ]);
    const answer = await ask(front, '/_fudic/nope.js');
    expect(answer.status).toBe(404);
    expect(answer.body).toBe('web GET /_fudic/nope.js');
  });

  it('404 when no app is served at the path', async () => {
    const front = await proxy([{ base: '/admin/', port: await backend('admin') }]);
    const answer = await ask(front, '/other');
    expect(answer.status).toBe(404);
    expect(answer.body).toBe('404 /other: no app is served here');
  });

  it('502 when the app does not answer', async () => {
    const front = await proxy([{ base: '/', port: await closedPort() }]);
    const answer = await ask(front, '/');
    expect(answer.status).toBe(502);
    expect(answer.body).toBe('502 the app did not answer');
  });

  it('ends the answer when the app dies after it started it', async () => {
    const dying = createServer((_req, res) => {
      // A body of unknown length, so only the end of the connection could end it; the app
      // dies once the headers and the first part are on their way.
      res.writeHead(200, { 'transfer-encoding': 'chunked' });
      res.write('partial');
      setTimeout(() => res.socket?.destroy(), 50);
    });
    const front = await proxy([{ base: '/', port: await listening(dying) }]);
    // The browser sees an answer cut short, not one that waits forever for the rest.
    const aborted = await new Promise<boolean>((resolve) => {
      const req = request({ host: '127.0.0.1', port: front, path: '/' }, (res) => {
        expect(res.statusCode).toBe(200);
        res.on('data', () => undefined);
        res.on('error', () => undefined);
        res.on('close', () => resolve(!res.complete));
      });
      req.on('error', () => resolve(true));
      req.end();
    });
    expect(aborted).toBe(true);
  });
});

/** A raw TCP app that answers an upgrade with 101 and then echoes. */
async function echoUpgrade(): Promise<number> {
  const seen: string[] = [];
  const server = createNetServer((socket) => {
    socket.once('data', (head) => {
      seen.push(head.toString());
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      socket.on('data', (data) => socket.write(data));
    });
  });
  (echoUpgrade as { seen?: string[] }).seen = seen;
  return listening(server as unknown as Server);
}

function upgrade(port: number, path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`);
      resolve(socket);
    });
    socket.on('error', reject);
  });
}

function read(socket: Socket, until: string): Promise<string> {
  return new Promise((resolve) => {
    let text = '';
    const onData = (data: Buffer): void => {
      text += data.toString();
      if (text.includes(until)) {
        socket.off('data', onData);
        resolve(text);
      }
    };
    socket.on('data', onData);
  });
}

describe('createProxy, WebSockets', () => {
  it('tunnels an upgrade to its app, headers and all, and pipes both ways', async () => {
    const app = await echoUpgrade();
    const front = await proxy([{ base: '/admin/', port: app }]);
    const socket = await upgrade(front, '/admin/?token=hmr');
    expect(await read(socket, '\r\n\r\n')).toContain('101 Switching Protocols');
    socket.write('ping');
    expect(await read(socket, 'ping')).toBe('ping');
    const seen = (echoUpgrade as { seen?: string[] }).seen ?? [];
    expect(seen.at(-1)).toMatch(/^GET \/admin\/\?token=hmr HTTP\/1\.1\r\n/u);
    expect(seen.at(-1)).toContain('Upgrade: websocket');
    socket.destroy();
  });

  it('closes an upgrade no app is served at', async () => {
    const front = await proxy([{ base: '/admin/', port: await echoUpgrade() }]);
    const socket = await upgrade(front, '/other');
    await new Promise((resolve) => socket.on('close', resolve));
    expect(socket.destroyed).toBe(true);
  });

  it('closes the upgrade when its app is down', async () => {
    const front = await proxy([{ base: '/', port: await closedPort() }]);
    const socket = await upgrade(front, '/');
    await new Promise((resolve) => socket.on('close', resolve));
    expect(socket.destroyed).toBe(true);
  });

  it('closes the app side when the browser side breaks', async () => {
    let appSide: Socket | undefined;
    const app = createNetServer((socket) => {
      appSide = socket;
      socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n');
    });
    const server = createProxy([{ base: '/', port: await listening(app as unknown as Server) }]);
    let browserSide: Duplex | undefined;
    server.prependListener('upgrade', (_req: IncomingMessage, socket: Duplex) => {
      browserSide = socket;
    });
    const socket = await upgrade(await listening(server), '/');
    await read(socket, '101');
    // An error on a socket nobody listens to is thrown; the tunnel takes it and lets go of the
    // app side instead.
    expect(() => browserSide?.emit('error', new Error('ECONNRESET'))).not.toThrow();
    expect(appSide).toBeDefined();
  });
});
