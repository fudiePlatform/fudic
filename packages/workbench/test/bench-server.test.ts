import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { connect, type AddressInfo, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { shellPath, socketPath, startBenchServer, type BenchServer } from '../src/bench-server.js';
import type {
  BenchMessage,
  ResultMessage,
  RunCommand,
  RunningMessage,
  SessionMessage,
  StateMessage,
} from '../src/protocol.js';
import { shellPage } from '../src/shell.js';

const SESSION: SessionMessage = {
  v: 2,
  type: 'session',
  tag: 'app-card',
  spec: 'C:/p/app-card.fudspec',
  diagnostics: [],
  criteria: [{ id: 'a', route: '/app-card/a', line: 3, steps: [{ block: 'then', text: 'app-card is visible', file: null }] }],
};

const RUNNING: RunningMessage = { v: 2, type: 'running', tag: 'app-card', ids: ['a', 'b'], trigger: { file: null, at: 1 } };

const STATE: StateMessage ={ v: 2, type: 'state', tag: 'app-card', paused: true, pinned: 'a', pending: 2 };

function result(id: string, verdict: ResultMessage['verdict'], tag = 'app-card'): ResultMessage {
  return { v: 2, type: 'result', tag, id, verdict, ms: 1, steps: [], shots: {}, marks: [], pageErrors: [] };
}

let server: BenchServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** A shell's socket: every message it receives, parsed. */
async function shell(origin: string, tag = 'app-card'): Promise<{ messages: BenchMessage[]; socket: WebSocket }> {
  const messages: BenchMessage[] = [];
  const socket = new WebSocket(`${origin.replace('http', 'ws')}${socketPath(tag)}`);
  socket.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data)) as BenchMessage));
  await new Promise((done, fail) => {
    socket.addEventListener('open', done);
    socket.addEventListener('error', fail);
  });
  return { messages, socket };
}

describe('the bench server — criterion 21', () => {
  it('serves each component\'s shell at /__bench/<tag>/, with or without a query', async () => {
    server = await startBenchServer({ port: 0 });
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect(shellPath('app-card')).toBe('/__bench/app-card/');
    expect(socketPath('app-card')).toBe('/__bench/app-card/ws');
    for (const path of ['/__bench/app-card/', '/__bench/app-tabs/?theme=dark']) {
      const res = await fetch(server.origin + path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await res.text()).toBe(shellPage());
    }
  });

  it('answers 404 before Vite is mounted, then hands everything else to Vite, and 404 when Vite passes', async () => {
    server = await startBenchServer({ port: 0 });
    expect((await fetch(`${server.origin}/a`)).status).toBe(404);
    expect((await fetch(`${server.origin}/__bench/`)).status).toBe(404);
    server.mount((req, res, next) => {
      if (req.url === '/a') res.writeHead(200).end('page a');
      else next();
    });
    const page = await fetch(`${server.origin}/a`);
    expect([page.status, await page.text()]).toEqual([200, 'page a']);
    const missing = await fetch(`${server.origin}/nowhere`);
    expect([missing.status, await missing.text()]).toEqual([404, 'not found']);
  });

  it('a shell that connects gets its component\'s last session, state and result of each criterion', async () => {
    server = await startBenchServer({ port: 0 });
    const early = await shell(server.origin);
    const other = await shell(server.origin, 'app-tabs');
    server.publish({ ...SESSION, criteria: [] });
    server.publish(SESSION);
    server.publish(RUNNING);
    server.publish(result('a', 'fail'));
    server.publish(result('b', 'pass'));
    server.publish(result('a', 'pass'));
    server.publish(STATE);
    server.publish({ v: 2, type: 'cancelled', tag: 'app-card', ids: [] });
    server.publish(result('x', 'pass', 'app-tabs'));
    server.publish({ v: 2, type: 'problem', message: 'Chrome went away' });

    const late = await shell(server.origin);
    await expect.poll(() => late.messages.length).toBe(5);
    expect(late.messages).toEqual([SESSION, STATE, RUNNING, result('a', 'pass'), result('b', 'pass')]);
    await expect.poll(() => early.messages.length).toBe(9);
    expect(early.messages.map((m) => m.type)).toEqual([
      'session',
      'session',
      'running',
      'result',
      'result',
      'result',
      'state',
      'cancelled',
      'problem',
    ]);
    await expect.poll(() => other.messages.map((m) => m.type)).toEqual(['result', 'problem']);
    for (const s of [early, other, late]) s.socket.close();
  });

  it('a new session forgets the results and the run of the last one', async () => {
    server = await startBenchServer({ port: 0 });
    server.publish(SESSION);
    server.publish(RUNNING);
    server.publish(result('a', 'pass'));
    server.publish({ ...SESSION, criteria: [] });
    const late = await shell(server.origin);
    await expect.poll(() => late.messages.length).toBe(1);
    await new Promise((done) => setTimeout(done, 50));
    expect(late.messages).toEqual([{ ...SESSION, criteria: [] }]);
    late.socket.close();
  });

  it('a shell that connects before any session gets nothing until one comes', async () => {
    server = await startBenchServer({ port: 0 });
    const first = await shell(server.origin);
    await new Promise((done) => setTimeout(done, 50));
    expect(first.messages).toEqual([]);
    server.publish(SESSION);
    await expect.poll(() => first.messages).toEqual([SESSION]);
    first.socket.close();
  });

  it('stops sending to a shell that went away, abruptly or not', async () => {
    server = await startBenchServer({ port: 0 });
    const gone = await shell(server.origin);
    gone.socket.close();
    await new Promise((done) => setTimeout(done, 100));
    expect(() => server!.publish(SESSION)).not.toThrow();
    expect(gone.messages).toEqual([]);
  });

  it('forgets a component: its shells are disconnected and a late one gets nothing', async () => {
    server = await startBenchServer({ port: 0 });
    server.publish(SESSION);
    const open = await shell(server.origin);
    const closed = new Promise((done) => open.socket.addEventListener('close', done));
    server.forget('app-card');
    server.forget('nobody');
    await closed;
    const late = await shell(server.origin);
    await new Promise((done) => setTimeout(done, 50));
    expect(late.messages).toEqual([]);
    late.socket.close();
  });

  it('leaves any other upgrade to Vite', async () => {
    server = await startBenchServer({ port: 0 });
    const upgrades: string[] = [];
    server.http.on('upgrade', (req, socket) => {
      if (req.url === socketPath('app-card')) return;
      upgrades.push(String(req.url));
      socket.destroy();
    });
    for (const path of ['/vite-hmr', '/__bench/app-card/other', '/__bench/x']) {
      const other = new WebSocket(`${server.origin.replace('http', 'ws')}${path}`);
      other.addEventListener('error', () => undefined);
    }
    await expect.poll(() => upgrades.sort()).toEqual(['/__bench/app-card/other', '/__bench/x', '/vite-hmr']);
  });

  it('closes with shells still open, and refuses a busy port', async () => {
    const busy: Server = createServer();
    await new Promise<void>((done) => busy.listen(0, '127.0.0.1', done));
    const port = (busy.address() as AddressInfo).port;
    try {
      await expect(startBenchServer({ port })).rejects.toThrow('EADDRINUSE');
    } finally {
      busy.close();
    }
    server = await startBenchServer({ port: 0 });
    const open = await shell(server.origin);
    const closed = new Promise((done) => open.socket.addEventListener('close', done));
    await server.close();
    server = undefined;
    await closed;
  });
});

/** The smallest PNG there is: the signature and nothing else is enough to be served. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('the shots — criterion 8', () => {
  it('serves the last shot of each criterion and kind as a PNG, and 404 for an old or unknown one', async () => {
    server = await startBenchServer({ port: 0 });
    const first = server.putShot('app-card', 'a b', 'after', PNG);
    const before = server.putShot('app-card', 'a b', 'before', Buffer.concat([PNG, Buffer.from([1])]));
    expect(first).toMatch(/^\/__bench\/app-card\/shot\/a%20b\/\d+-after\.png$/u);
    const res = await fetch(server.origin + first);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);

    const second = server.putShot('app-card', 'a b', 'after', PNG);
    expect(second).not.toBe(first);
    expect((await fetch(server.origin + first)).status).toBe(404);
    expect((await fetch(server.origin + second)).status).toBe(200);
    expect((await fetch(server.origin + before)).status).toBe(200);
    expect((await fetch(`${server.origin}/__bench/app-tabs/shot/a/1-after.png`)).status).toBe(404);
    server.forget('app-card');
    expect((await fetch(server.origin + second)).status).toBe(404);
  });
});

/** A raw client socket, to send frames the browser's WebSocket never would. */
async function rawSocket(origin: string, tag = 'app-card'): Promise<{ socket: Socket; received: () => Buffer }> {
  const { port } = new URL(origin);
  const socket = connect(Number(port), '127.0.0.1');
  let data = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => (data = Buffer.concat([data, chunk])));
  await new Promise((done) => socket.once('connect', done));
  socket.write(
    `GET ${socketPath(tag)} HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  );
  await expect.poll(() => data.toString('latin1').includes('\r\n\r\n')).toBe(true);
  const head = data.indexOf('\r\n\r\n') + 4;
  return { socket, received: () => data.subarray(head) };
}

/** A client frame: masked unless told otherwise. */
function clientFrame(opcode: number, payload: Buffer, masked = true): Buffer {
  const mask = randomBytes(4);
  const body = masked ? Buffer.from(payload.map((b, i) => b ^ mask[i % 4]!)) : payload;
  return Buffer.concat([Buffer.from([0x80 | opcode, (masked ? 0x80 : 0) | payload.length]), masked ? mask : Buffer.alloc(0), body]);
}

describe('commands over the WebSocket — criteria 10 and 11', () => {
  it('a masked text frame from the browser arrives as a command, for the shell\'s own component', async () => {
    server = await startBenchServer({ port: 0 });
    const commands: RunCommand[] = [];
    const s = await shell(server.origin);
    // Before anyone obeys, what a shell sends is ignored.
    s.socket.send(JSON.stringify({ v: 2, type: 'cancel', tag: 'app-card' }));
    await new Promise((done) => setTimeout(done, 50));
    server.onCommand((command) => commands.push(command));
    s.socket.send(JSON.stringify({ v: 2, type: 'run', tag: 'app-tabs', ids: ['a'] }));
    s.socket.send(JSON.stringify({ v: 2, type: 'open', file: 'C:/p/x.fud' }));
    s.socket.send(JSON.stringify({ v: 2, type: 'close', tag: 'app-card' }));
    s.socket.send('not json');
    s.socket.send(JSON.stringify({ v: 2, type: 'pause', tag: 'app-card', paused: true }));
    await expect.poll(() => commands).toEqual([
      { v: 2, type: 'run', tag: 'app-card', ids: ['a'] },
      { v: 2, type: 'pause', tag: 'app-card', paused: true },
    ]);
    s.socket.close();
  });

  it('a close is answered with a close, echoing its code, and 1000 for one without', async () => {
    server = await startBenchServer({ port: 0 });
    for (const [payload, code] of [
      [Buffer.from([0x0f, 0xa0]), 4000],
      [Buffer.alloc(0), 1000],
    ] as const) {
      const raw = await rawSocket(server.origin);
      const ended = new Promise((done) => raw.socket.once('end', done));
      raw.socket.write(clientFrame(0x8, payload));
      await ended;
      expect([...raw.received()]).toEqual([0x88, 2, code >> 8, code & 0xff]);
      raw.socket.destroy();
    }
  });

  it('a ping is answered with a pong carrying its payload', async () => {
    server = await startBenchServer({ port: 0 });
    const raw = await rawSocket(server.origin);
    raw.socket.write(clientFrame(0x9, Buffer.from('hi')));
    await expect.poll(() => [...raw.received()]).toEqual([0x8a, 2, 0x68, 0x69]);
    raw.socket.destroy();
  });

  it('a binary frame closes with 1003', async () => {
    server = await startBenchServer({ port: 0 });
    const raw = await rawSocket(server.origin);
    const ended = new Promise((done) => raw.socket.once('end', done));
    raw.socket.write(clientFrame(0x2, Buffer.from([1, 2, 3])));
    await ended;
    expect([...raw.received()]).toEqual([0x88, 2, 0x03, 0xeb]);
    raw.socket.destroy();
  });
});

describe('the shell page', () => {
  it('is a whole document that paints what its socket says', () => {
    const html = shellPage();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('@media (prefers-color-scheme: dark)');
  });
});
