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
  rmSync(root, { recursive: true, force: true });
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
    const running = deps.start(app(), kind, port);
    try {
      await deps.ready(port, '/');
      const page = await (await fetch(`http://127.0.0.1:${port}/`)).text();
      expect(page).toContain(kind === 'dev' ? '<title>app</title>' : '<title>built</title>');
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
});
