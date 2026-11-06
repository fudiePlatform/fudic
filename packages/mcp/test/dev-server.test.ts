/**
 * The dev server of the MCP (SDD-78 §4.3): what a project needs to be served, which project of a
 * workspace is, and the life of the server — starting once, failing, starting again, the errors
 * it keeps, the requests and upgrades it is handed. Vite is a stand-in here, loaded from the
 * project's own `node_modules` as the real one is; `preview-e2e.test.ts` starts the real one.
 */

import { EventEmitter } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import type { Duplex } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { appOf, DevServer, missingOf, PREVIEW_PORT, START_WAIT_MS } from '../src/dev-server.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir> | undefined;

afterEach(() => {
  dir?.dispose();
  dir = undefined;
});

function write(files: Readonly<Record<string, string>>): string {
  dir = tempDir();
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir.root, path)), { recursive: true });
    writeFileSync(join(dir.root, path), text);
  }
  return dir.root;
}

const VITE_PKG = { 'node_modules/vite/package.json': JSON.stringify({ name: 'vite', exports: { '.': { import: './dist/index.js' } } }) };
const FUDIC_VITE_PKG = { 'node_modules/@fudic/vite/package.json': JSON.stringify({ name: '@fudic/vite' }) };
const SERVABLE = { 'fudic.json': '{}', 'vite.config.ts': '', ...VITE_PKG, ...FUDIC_VITE_PKG };

it('listens first on 4318 over stdio, and waits up to 30 s for the first start', () => {
  expect(PREVIEW_PORT).toBe(4318);
  expect(START_WAIT_MS).toBe(30_000);
});

describe('appOf', () => {
  it('a project is its own app', () => {
    const root = write({ 'fudic.json': '{}' });
    expect(appOf(root)).toBe(root);
  });

  it('in a workspace, its first app; with only libraries, the first project', () => {
    const root = write({
      'pnpm-workspace.yaml': '',
      'libs/ui/fudic.json': JSON.stringify({ kind: 'lib' }),
      'apps/web/fudic.json': JSON.stringify({ kind: 'app' }),
      'apps/zzz/fudic.json': JSON.stringify({ kind: 'app' }),
    });
    expect(appOf(root).replace(/\\/gu, '/')).toMatch(/apps\/web$/u);
    const libs = write({ 'pnpm-workspace.yaml': '', 'libs/ui/fudic.json': JSON.stringify({ kind: 'lib' }) });
    expect(appOf(libs).replace(/\\/gu, '/')).toMatch(/libs\/ui$/u);
  });
});

describe('missingOf', () => {
  it('nothing when it has a vite.config of any kind, @fudic/vite and vite', () => {
    for (const config of ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']) {
      const root = write({ [config]: '', ...VITE_PKG, ...FUDIC_VITE_PKG });
      expect(missingOf(root), config).toBeUndefined();
    }
  });

  it('what is missing, in order: the config, @fudic/vite, vite', () => {
    expect(missingOf(write({ ...VITE_PKG, ...FUDIC_VITE_PKG }))).toBe('the project has no vite.config.ts with fudic() in its plugins');
    expect(missingOf(write({ 'vite.config.ts': '', ...VITE_PKG }))).toBe('@fudic/vite is not installed in the project: pnpm add -D @fudic/vite vite');
    expect(missingOf(write({ 'vite.config.ts': '', ...FUDIC_VITE_PKG }))).toBe('vite is not installed in the project: pnpm add -D vite');
  });
});

/** A Vite dev server, as much of it as the MCP's touches. */
class FakeVite {
  readonly sent: unknown[] = [];
  readonly handled: IncomingMessage[] = [];
  listened = false;
  closed = false;
  address: unknown = { port: 4319 };
  answers = true;
  readonly ws = { send: (...args: unknown[]) => this.sent.push(args[0]) };
  readonly httpServer = { address: () => this.address };
  readonly middlewares = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    this.handled.push(req);
    if (this.answers) res.writeHead(200).end('app');
    else next();
  };

  async listen(): Promise<void> {
    this.listened = true;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** The vite module the server imports: `createServer` answers `vite`, or throws `fail`. */
function viteModule(vite: FakeVite, over: { fail?: unknown; gate?: Promise<void> } = {}) {
  const configs: Record<string, unknown>[] = [];
  const urls: string[] = [];
  let calls = 0;
  const load = async (url: string): Promise<unknown> => {
    urls.push(url);
    return {
      createServer: async (config: Record<string, unknown>) => {
        configs.push(config);
        calls += 1;
        await over.gate;
        if (over.fail !== undefined && calls === 1) throw over.fail;
        return vite;
      },
    };
  };
  return { load, configs, urls, calls: () => calls };
}

const res = (): ServerResponse & { status?: number; body?: string } => {
  const out = {
    writeHead(status: number) {
      out.status = status;
      return out;
    },
    end(body?: string) {
      out.body = body ?? '';
      return out;
    },
  } as unknown as ServerResponse & { status?: number; body?: string };
  return out;
};

describe('DevServer', () => {
  it('over stdio: the project\'s vite, on its port and the next free one, listening; ready once', async () => {
    const root = write(SERVABLE);
    const vite = new FakeVite();
    const mod = viteModule(vite);
    const dev = new DevServer(root, { kind: 'listen', port: 4318 }, mod.load);
    expect(dev.state).toBe('idle');
    expect(dev.local).toBeUndefined();
    expect(dev.app).toBe(root);
    expect(await dev.ready()).toBe('ready');
    expect(mod.urls).toEqual([expect.stringMatching(/node_modules\/vite\/dist\/index\.js$/u)]);
    expect(mod.configs).toEqual([{ root, logLevel: 'error', server: { host: '127.0.0.1', port: 4318, strictPort: false }, clearScreen: false }]);
    expect(vite.listened).toBe(true);
    expect(dev.local).toBe('http://127.0.0.1:4319');
    // Asked again: the same server.
    await dev.start();
    expect(await dev.ready()).toBe('ready');
    expect(mod.calls()).toBe(1);
  });

  it('local is undefined while the address is none or a pipe', async () => {
    const vite = new FakeVite();
    const dev = new DevServer(write(SERVABLE), { kind: 'listen', port: 4318 }, viteModule(vite).load);
    await dev.ready();
    vite.address = null;
    expect(dev.local).toBeUndefined();
    vite.address = '\\\\.\\pipe\\vite';
    expect(dev.local).toBeUndefined();
  });

  it('over HTTP: middleware with its HMR on a server of its own, not listening', async () => {
    const vite = new FakeVite();
    const mod = viteModule(vite);
    const dev = new DevServer(write(SERVABLE), { kind: 'middleware' }, mod.load);
    expect(await dev.ready()).toBe('ready');
    const server = mod.configs[0]!['server'] as { middlewareMode: boolean; hmr: { server: EventEmitter } };
    expect(server.middlewareMode).toBe(true);
    expect(server.hmr.server).toBeInstanceOf(EventEmitter);
    expect(vite.listened).toBe(false);

    // A WebSocket handed to it reaches that server as an upgrade.
    const seen: unknown[] = [];
    server.hmr.server.on('upgrade', (...args: unknown[]) => seen.push(args));
    const req = {} as IncomingMessage;
    const socket = {} as Duplex;
    const head = Buffer.from('');
    dev.upgrade(req, socket, head);
    expect(seen).toEqual([[req, socket, head]]);
  });

  it('a request goes to Vite\'s middlewares; one nobody answers is a 404', async () => {
    const vite = new FakeVite();
    const dev = new DevServer(write(SERVABLE), { kind: 'middleware' }, viteModule(vite).load);
    await dev.ready();
    const req = { url: '/' } as IncomingMessage;
    const answered = res();
    dev.handle(req, answered);
    expect(answered).toMatchObject({ status: 200, body: 'app' });
    vite.answers = false;
    const unanswered = res();
    dev.handle(req, unanswered);
    expect(unanswered).toMatchObject({ status: 404, body: '' });
    expect(vite.handled).toHaveLength(2);
  });

  it('a start that fails is its state, with what Vite said; the next start tries again', async () => {
    const vite = new FakeVite();
    const mod = viteModule(vite, { fail: new Error('port 4318 is in use') });
    const dev = new DevServer(write(SERVABLE), { kind: 'listen', port: 4318 }, mod.load);
    expect(await dev.ready()).toBe('failed');
    expect(dev.failure).toBe('port 4318 is in use');
    expect(await dev.ready()).toBe('ready');
    expect(mod.calls()).toBe(2);
  });

  it('what is thrown that is no Error is said as it is', async () => {
    const dev = new DevServer(write(SERVABLE), { kind: 'listen', port: 4318 }, viteModule(new FakeVite(), { fail: 'bad config' }).load);
    expect(await dev.ready()).toBe('failed');
    expect(dev.failure).toBe('bad config');
  });

  it('ready waits as long as it is told: still starting after that', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const dev = new DevServer(write(SERVABLE), { kind: 'middleware' }, viteModule(new FakeVite(), { gate }).load);
    expect(await dev.ready(10)).toBe('starting');
    expect(dev.state).toBe('starting');
    open();
    expect(await dev.ready(10_000)).toBe('ready');
  });

  it('keeps what was thrown, once, and only what has a stack: the live type check is not kept', async () => {
    const vite = new FakeVite();
    const dev = new DevServer(write(SERVABLE), { kind: 'middleware' }, viteModule(vite).load);
    await dev.ready();
    const thrown = { type: 'error', err: { message: 'boom', stack: 'Error: boom\n    at load (/p/src/server/x.ts:3:9)' } };
    const checked = { type: 'error', err: { message: 'FUD0540', stack: 'src/x.fud:3:5' } };
    for (const payload of [thrown, checked, { type: 'error' }, { type: 'update' }]) (vite.ws.send as (p: unknown) => void)(payload);
    // Everything still reaches the overlay.
    expect(vite.sent).toHaveLength(4);
    expect(dev.takeErrors()).toEqual([thrown.err]);
    expect(dev.takeErrors()).toEqual([]);
  });

  it('close: after its start, Vite closed; never started, nothing to close', async () => {
    const vite = new FakeVite();
    const dev = new DevServer(write(SERVABLE), { kind: 'middleware' }, viteModule(vite).load);
    void dev.start();
    await dev.close();
    expect(vite.closed).toBe(true);
    await new DevServer(write(SERVABLE), { kind: 'middleware' }, viteModule(new FakeVite()).load).close();
  });
});
