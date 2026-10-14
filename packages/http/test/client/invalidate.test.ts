/**
 * SDD-56 §4.9, the client half of criteria 31–33: what a call leaves stale, and that the
 * promise does not resolve until the Service Worker confirms it deleted it. The worker is a
 * stand-in that answers on the port it was handed, when the test says so.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INVALIDATE_MESSAGE } from '@fudic/conventions';
import { $fn } from '../../src/client/fn.js';
import { invalidate } from '../../src/client/invalidate.js';
import type { Method } from '../../src/types.js';

interface Posted {
  readonly message: { type: string; paths: string[] };
  readonly port: MessagePort;
}

/** A Service Worker controlling the page; it confirms only when `confirm()` is called. */
function worker(): { posted: Posted[]; confirm: () => void } {
  const posted: Posted[] = [];
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: {
        postMessage: (message: Posted['message'], transfer: MessagePort[]) =>
          posted.push({ message, port: transfer[0]! }),
      },
    },
  });
  return {
    posted,
    confirm: () => {
      for (const p of posted) p.port.postMessage('done');
    },
  };
}

/** Whether `p` is still pending after a few turns of the event loop. */
async function pending(p: Promise<unknown>): Promise<boolean> {
  const marker = Symbol('pending');
  return (await Promise.race([p, new Promise((r) => setTimeout(() => r(marker), 10))])) === marker;
}

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/usuarios' });
  vi.stubGlobal('fetch', async () => new Response('{"ok":true}', { status: 200 }));
});
afterEach(() => vi.unstubAllGlobals());

const call = (method: Method, invalidates?: string[], base?: string) =>
  $fn<any, unknown>({
    name: 'x',
    method,
    url: '/_fudic/fn/r/usuarios/x',
    chain: [],
    ...(invalidates !== undefined ? { invalidates } : {}),
    ...(base !== undefined ? { base } : {}),
  });

describe('invalidate', () => {
  it('without a worker controlling the page, resolves at once', async () => {
    vi.stubGlobal('navigator', { serviceWorker: { controller: null } });
    await expect(invalidate(['/a'])).resolves.toBeUndefined();
    vi.stubGlobal('navigator', {});
    await expect(invalidate(['/a'])).resolves.toBeUndefined();
    vi.stubGlobal('navigator', undefined);
    await expect(invalidate(['/a'])).resolves.toBeUndefined();
  });

  it('with nothing to invalidate, does not bother the worker', async () => {
    const sw = worker();
    await expect(invalidate([])).resolves.toBeUndefined();
    expect(sw.posted).toHaveLength(0);
  });

  it('posts the paths and waits for the worker to answer on the port', async () => {
    const sw = worker();
    const p = invalidate(['/a', '/b/:slug']);
    expect(await pending(p)).toBe(true);
    expect(sw.posted[0]!.message).toEqual({ type: INVALIDATE_MESSAGE, paths: ['/a', '/b/:slug'] });
    sw.confirm();
    await expect(p).resolves.toBeUndefined();
  });
});

describe('what a call leaves stale (§4.9)', () => {
  it('criterion 31: a PUT invalidates the page it was made from, and resolves only after the confirmation', async () => {
    const sw = worker();
    const p = call('PUT')({});
    expect(await pending(p)).toBe(true);
    expect(sw.posted.map((x) => x.message.paths)).toEqual([['/usuarios']]);
    sw.confirm();
    expect(await p).toEqual({ ok: true });
  });

  it('criterion 32: its .invalidates too, a pattern as it is, after the page', async () => {
    const sw = worker();
    const p = call('POST', ['/blog', '/blog/:slug'])({});
    await pending(p);
    expect(sw.posted[0]!.message.paths).toEqual(['/usuarios', '/blog', '/blog/:slug']);
    sw.confirm();
    await p;
  });

  it('with a base, its own paths carry it', async () => {
    const sw = worker();
    vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/app/usuarios' });
    const p = call('DELETE', ['/blog/:slug'], '/app/')({});
    await pending(p);
    expect(sw.posted[0]!.message.paths).toEqual(['/app/usuarios', '/app/blog/:slug']);
    sw.confirm();
    await p;
  });

  it('criterion 33: a GET without .invalidates invalidates nothing, and does not wait', async () => {
    const sw = worker();
    expect(await call('GET')()).toEqual({ ok: true });
    expect(sw.posted).toHaveLength(0);
  });

  it('a GET invalidates only its own .invalidates, not the page', async () => {
    const sw = worker();
    const p = call('GET', ['/blog'])();
    await pending(p);
    expect(sw.posted[0]!.message.paths).toEqual(['/blog']);
    sw.confirm();
    await p;
  });

  it('a failed call invalidates nothing', async () => {
    const sw = worker();
    vi.stubGlobal('fetch', async () => new Response('{"status":409,"title":"Conflict"}', { status: 409 }));
    await expect(call('PUT', ['/blog'])({})).rejects.toMatchObject({ status: 409 });
    expect(sw.posted).toHaveLength(0);
  });
});
