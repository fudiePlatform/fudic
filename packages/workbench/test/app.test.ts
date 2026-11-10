/**
 * SDD-82 §3.8: the app's server without a real Vite — the bench installed before the app's Vite
 * starts and taken away if it cannot, `/__bench/criterion/<id>` before Vite, a 404 when Vite
 * passes — and the requests in flight of a context, as the quiet page counts them.
 */

import { describe, expect, it } from 'vitest';
import { installedBench } from '@fudic/vite';
import type { ViteDevServer } from 'vite';
import { startApp } from '../src/app.js';
import { inFlight } from '../src/browser.js';

/** A Vite that answers `/a` and passes everything else. */
const fakeVite = (closed: string[]): ViteDevServer =>
  ({
    middlewares: (req: { url: string }, res: { writeHead(s: number): { end(t: string): void } }, next: () => void) => {
      if (req.url === '/a') res.writeHead(200).end('page a');
      else next();
    },
    close: async () => void closed.push('vite'),
  }) as unknown as ViteDevServer;

describe('startApp', () => {
  it('installs the bench, serves the criteria and Vite on its own port, and undoes it all on close', async () => {
    const closed: string[] = [];
    const app = await startApp('C:/p', async () => {
      expect(installedBench()).toBeDefined();
      return fakeVite(closed);
    });
    expect(app.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect(app.run).toMatch(/^[a-z0-9]+$/u);
    app.bench.begin('r-1.c', {}, { services: 's' });
    expect(await (await fetch(`${app.origin}/__bench/criterion/r-1.c`)).json()).toEqual({ services: 's', answers: [], clock: null });
    expect(await (await fetch(`${app.origin}/a`)).text()).toBe('page a');
    const missing = await fetch(`${app.origin}/b?x=1`);
    expect([missing.status, await missing.text()]).toEqual([404, 'not found']);
    await app.close();
    expect(closed).toEqual(['vite']);
    expect(installedBench()).toBeUndefined();
  });

  it('a Vite that does not start takes the bench away with it', async () => {
    await expect(startApp('C:/p', () => Promise.reject(new Error('no config')))).rejects.toThrow('no config');
    expect(installedBench()).toBeUndefined();
  });
});

describe('inFlight', () => {
  it('counts the requests of a context until they finish or fail, never a stream', () => {
    const listeners = new Map<string, (request: unknown) => void>();
    const pending = inFlight({ on: ((event: string, listener: (request: unknown) => void) => void listeners.set(event, listener)) as never });
    const request = (type: string, path: string) => ({ resourceType: () => type, method: () => 'GET', url: () => `http://x${path}?q=1` });
    const a = request('fetch', '/a');
    const b = request('document', '/b');
    listeners.get('request')!(a);
    listeners.get('request')!(b);
    listeners.get('request')!(request('eventsource', '/events'));
    listeners.get('request')!(request('websocket', '/ws'));
    expect(pending()).toEqual(['GET /a', 'GET /b']);
    listeners.get('requestfinished')!(a);
    listeners.get('requestfailed')!(b);
    expect(pending()).toEqual([]);
  });
});
