import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startBenchServer, type BenchServer } from '../src/bench-server.js';
import type { BenchMessage, ResultMessage, SessionMessage } from '../src/protocol.js';
import { shellPage } from '../src/shell.js';

const SESSION: SessionMessage = {
  v: 1,
  type: 'session',
  tag: 'app-card',
  diagnostics: [],
  criteria: [{ id: 'a', route: '/a', steps: [{ block: 'then', text: 'app-card is visible' }] }],
};

function result(id: string, verdict: ResultMessage['verdict']): ResultMessage {
  return { v: 1, type: 'result', id, verdict, ms: 1, steps: [], pageErrors: [] };
}

let server: BenchServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

/** A shell's socket: every message it receives, parsed. */
async function shell(origin: string): Promise<{ messages: BenchMessage[]; socket: WebSocket }> {
  const messages: BenchMessage[] = [];
  const socket = new WebSocket(`${origin.replace('http', 'ws')}/__bench/ws`);
  socket.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data)) as BenchMessage));
  await new Promise((done, fail) => {
    socket.addEventListener('open', done);
    socket.addEventListener('error', fail);
  });
  return { messages, socket };
}

describe('the bench server — criterion 21', () => {
  it('serves the shell at /__bench/, with or without a query', async () => {
    server = await startBenchServer({ port: 0 });
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    for (const path of ['/__bench/', '/__bench/?from=vscode']) {
      const res = await fetch(server.origin + path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await res.text()).toBe(shellPage());
    }
  });

  it('answers 404 before Vite is mounted, then hands everything else to Vite, and 404 when Vite passes', async () => {
    server = await startBenchServer({ port: 0 });
    expect((await fetch(`${server.origin}/a`)).status).toBe(404);
    server.mount((req, res, next) => {
      if (req.url === '/a') res.writeHead(200).end('page a');
      else next();
    });
    const page = await fetch(`${server.origin}/a`);
    expect([page.status, await page.text()]).toEqual([200, 'page a']);
    const missing = await fetch(`${server.origin}/nowhere`);
    expect([missing.status, await missing.text()]).toEqual([404, 'not found']);
  });

  it('a shell that connects gets the last session and the last result of each criterion', async () => {
    server = await startBenchServer({ port: 0 });
    const early = await shell(server.origin);
    server.publish({ v: 1, type: 'session', tag: 'old', diagnostics: [], criteria: [] });
    server.publish(SESSION);
    server.publish({ v: 1, type: 'running', ids: ['a', 'b'] });
    server.publish(result('a', 'fail'));
    server.publish(result('b', 'pass'));
    server.publish(result('a', 'pass'));
    server.publish({ v: 1, type: 'problem', message: 'Chrome went away' });

    const late = await shell(server.origin);
    await expect.poll(() => late.messages.length).toBe(3);
    expect(late.messages).toEqual([SESSION, result('a', 'pass'), result('b', 'pass')]);
    await expect.poll(() => early.messages.length).toBe(7);
    expect(early.messages.map((m) => m.type)).toEqual(['session', 'session', 'running', 'result', 'result', 'result', 'problem']);
    early.socket.close();
    late.socket.close();
  });

  it('a new session forgets the results of the last one', async () => {
    server = await startBenchServer({ port: 0 });
    server.publish(SESSION);
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

  it('leaves any other upgrade to Vite', async () => {
    server = await startBenchServer({ port: 0 });
    const upgrades: string[] = [];
    server.http.on('upgrade', (req, socket) => {
      if (req.url === '/__bench/ws') return;
      upgrades.push(String(req.url));
      socket.destroy();
    });
    const other = new WebSocket(`${server.origin.replace('http', 'ws')}/vite-hmr`);
    other.addEventListener('error', () => undefined);
    await expect.poll(() => upgrades).toEqual(['/vite-hmr']);
    other.close();
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

describe('the shell page', () => {
  it('is a whole document that paints what its socket says', () => {
    const html = shellPage();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Workbench</title>');
    expect(html).toContain('<main id="criteria"></main>');
    expect(html).toContain("'/__bench/ws'");
    expect(html).toContain('@media (prefers-color-scheme: dark)');
  });
});
