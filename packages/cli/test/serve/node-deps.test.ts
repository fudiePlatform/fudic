/**
 * BUG-50 §4.5 — the real machine behind `fudic dev`: free ports, a real Vite started from the
 * app's own install and stopped with it, the wait for it to answer, the proxy's listen, Ctrl-C.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { nodeServeDeps } from '../../src/serve/workspace.js';
import type { ServedApp } from '../../src/workspace/bases.js';

const deps = nodeServeDeps();
let root: string;

beforeAll(() => {
  // An app as `g app` leaves it, reduced to what Vite needs: its package, its page, its `vite`.
  root = mkdtempSync(join(tmpdir(), 'fudic-serve-')).replace(/\\/gu, '/');
  writeFileSync(join(root, 'package.json'), '{ "name": "app", "private": true, "type": "module" }');
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>app</title>');
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist', 'index.html'), '<!doctype html><title>built</title>');
  mkdirSync(join(root, 'node_modules'));
  const vite = dirname(createRequire(import.meta.url).resolve('vite/package.json'));
  symlinkSync(vite, join(root, 'node_modules', 'vite'), 'junction');
});

afterAll(() => {
  // Retried: on Windows a Vite just killed holds its folder for a moment after it is gone.
  rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const app = (): ServedApp => ({ name: 'app', path: root, base: '/', port: 0 });

describe('nodeServeDeps', () => {
  it('finds a port nothing listens on', async () => {
    const port = await deps.freePort();
    expect(port).toBeGreaterThan(0);
    const server = createServer();
    await deps.listen(server, port);
    server.close();
  });

  it.each(['dev', 'preview'] as const)('starts the app\'s own Vite for %s, waits for it, and stops it', async (kind) => {
    const port = await deps.freePort();
    const lines: [string, string][] = [];
    const running = deps.start(app(), kind, port, (text, stream) => lines.push([text, stream]));
    try {
      await deps.ready(port, '/');
      const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      expect(page).toContain(kind === 'dev' ? '<title>app</title>' : '<title>built</title>');
      // Its lines come back one by one, whole, with no newline and the stream they came on —
      // with no colour: this terminal is no TTY.
      await vi.waitFor(() => expect(lines.some(([text]) => text.includes(String(port)))).toBe(true));
      expect(lines.every(([text, stream]) => !text.includes('\n') && stream === 'out')).toBe(true);
      expect(lines.some(([text]) => text.includes('\u001b['))).toBe(false);
    } finally {
      running.stop();
    }
  }, 60_000);

  it('in colour when the terminal has colour, and what goes to stderr comes back as err', async () => {
    const port = await deps.freePort();
    const lines: [string, string][] = [];
    const tty = process.stdout.isTTY;
    process.stdout.isTTY = true;
    // A `NO_COLOR` of the machine running the tests would win over the colour asked for.
    vi.stubEnv('NO_COLOR', undefined);
    // `preview` with no build: Vite says so on stderr.
    const bare = mkdtempSync(join(tmpdir(), 'fudic-serve-bare-')).replace(/\\/gu, '/');
    writeFileSync(join(bare, 'package.json'), '{ "name": "bare", "private": true, "type": "module" }');
    mkdirSync(join(bare, 'node_modules'));
    symlinkSync(dirname(createRequire(import.meta.url).resolve('vite/package.json')), join(bare, 'node_modules', 'vite'), 'junction');
    const coloured = deps.start(app(), 'dev', port, (text, stream) => lines.push([text, stream]));
    const failing = deps.start({ name: 'bare', path: bare, base: '/', port: 0 }, 'preview', await deps.freePort(), (text, stream) =>
      lines.push([text, stream]),
    );
    process.stdout.isTTY = tty;
    vi.unstubAllEnvs();
    try {
      await deps.ready(port, '/');
      await vi.waitFor(() => expect(lines.some(([text]) => text.includes('\u001b[')), JSON.stringify(lines)).toBe(true), {
        timeout: 20_000,
      });
      await vi.waitFor(() => expect(lines.some(([, stream]) => stream === 'err'), JSON.stringify(lines)).toBe(true), {
        timeout: 20_000,
      });
    } finally {
      coloured.stop();
      failing.stop();
      rmSync(bare, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    }
  }, 60_000);

  it('keeps the NO_COLOR of the user on a TTY: no colour forced, and no warning of Node about both', async () => {
    const port = await deps.freePort();
    const lines: [string, string][] = [];
    const tty = process.stdout.isTTY;
    process.stdout.isTTY = true;
    vi.stubEnv('NO_COLOR', '1');
    const running = deps.start(app(), 'dev', port, (text, stream) => lines.push([text, stream]));
    process.stdout.isTTY = tty;
    vi.unstubAllEnvs();
    try {
      await deps.ready(port, '/');
      await vi.waitFor(() => expect(lines.some(([text]) => text.includes(String(port)))).toBe(true), { timeout: 20_000 });
      expect(lines.some(([text]) => text.includes('\u001b['))).toBe(false);
      expect(lines.some(([text]) => text.includes('NO_COLOR'))).toBe(false);
    } finally {
      running.stop();
    }
  }, 60_000);

  it('gives up when nothing answers in time', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(120_000);
    await expect(deps.ready(1, '/')).rejects.toThrow('nothing answered on port 1 within 60 s');
  });

  it('rejects a port that is taken', async () => {
    const taken = createServer();
    const port = await deps.freePort();
    await deps.listen(taken, port);
    try {
      await expect(deps.listen(createServer(), port)).rejects.toThrow(/EADDRINUSE/u);
    } finally {
      taken.close();
    }
  });

  it('is stopped by Ctrl-C, or by whoever started it', async () => {
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handlers = new Map<string, () => void>();
      vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
        handlers.set(event, handler);
        return process;
      }) as typeof process.once);
      const stopped = deps.stopped();
      handlers.get(signal)?.();
      await expect(stopped).resolves.toBeUndefined();
      vi.restoreAllMocks();
    }
  });

  it('writes the banner on stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    deps.out('fudic dev\n');
    expect(write).toHaveBeenCalledWith('fudic dev\n');
  });

  it('writes an app’s errors on stderr, and tells the time of the system', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    deps.err('  web     boom\n');
    expect(write).toHaveBeenCalledWith('  web     boom\n');
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    expect(deps.now()).toBe(1234);
  });
});
