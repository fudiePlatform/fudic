/**
 * SDD-68 §4.8, step 1, and criterion 18 — after a call invalidates the page it was made from,
 * the stub tells the page with `DATA_STALE_EVENT` and resolves only after what the listeners
 * handed over with `wait`. And `method` on the stub, which is what makes a server function a
 * `Callable` of `@fudic/core` (§3.2).
 *
 * `document` is an `EventTarget` stand-in: what matters is the event and its detail, not a DOM.
 * There is no Service Worker, so `invalidate` resolves at once and the order observed here is
 * the stub's own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_STALE_EVENT, type DataStaleDetail } from '@fudic/conventions';
import { fn, stub } from '../../src/contract/fn.js';
import { announceStale } from '../../src/client/invalidate.js';
import { resetRegistry } from '../../src/contract/index.js';
import type { Method } from '../../src/types.js';
import { binWire } from '../../src/wire/bin.js';
import type { Ty } from '../../src/wire/ty.js';

const OK: Ty = { fields: () => ({ ok: 'bool' }) };

/** A `document` that records every `DATA_STALE_EVENT`, and lets a test answer it. */
function page(): { seen: DataStaleDetail[]; doc: EventTarget } {
  const doc = new EventTarget();
  const seen: DataStaleDetail[] = [];
  doc.addEventListener(DATA_STALE_EVENT, (event) => {
    seen.push((event as CustomEvent<DataStaleDetail>).detail);
  });
  vi.stubGlobal('document', doc);
  return { seen, doc };
}

/** A promise and the hand that settles it. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('navigator', { serviceWorker: { controller: null } });
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/usuarios' });
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(binWire.encodeValue(OK, { ok: true }) as BodyInit, {
        status: 200,
        headers: { 'content-type': binWire.type },
      }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetRegistry();
});

const call = (method: Method, invalidates?: string[], base?: string) =>
  stub<never, unknown, any>({
    id: 'routes/usuarios',
    name: 'save',
    method,
    chain: [],
    returns: OK,
    wire: binWire,
    ...(invalidates !== undefined ? { invalidates } : {}),
    ...(base !== undefined ? { base } : {}),
  });

describe('the verb on a server function (§3.2)', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)('the stub of a %s carries it as method', (method) => {
    expect(call(method).method).toBe(method);
  });

  it('so does the server side of the contract', () => {
    expect(fn({ id: 'routes/usuarios', name: 'remove', method: 'DELETE', chain: [], wire: binWire }).method).toBe('DELETE');
  });
});

describe('the stub tells the page its data is stale (§4.8, step 1)', () => {
  it('a PUT dispatches the event with what it invalidated, and resolves after the wait', async () => {
    const { doc } = page();
    const work = deferred();
    const order: string[] = [];
    let detail: DataStaleDetail | undefined;
    doc.addEventListener(DATA_STALE_EVENT, (event) => {
      detail = (event as CustomEvent<DataStaleDetail>).detail;
      order.push('event');
      detail.wait(work.promise.then(() => void order.push('repainted')));
    });
    const p = call('PUT', ['/blog'])({}).then((v) => {
      order.push('resolved');
      return v;
    });
    await vi.waitFor(() => expect(order).toEqual(['event']));
    expect(detail!.paths).toEqual(['/usuarios', '/blog']);
    // Held until the listener's work settles.
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(['event']);
    work.resolve();
    expect(await p).toEqual({ ok: true });
    expect(order).toEqual(['event', 'repainted', 'resolved']);
  });

  it('waits for every listener that handed something over', async () => {
    const { doc } = page();
    const a = deferred();
    const b = deferred();
    doc.addEventListener(DATA_STALE_EVENT, (e) => (e as CustomEvent<DataStaleDetail>).detail.wait(a.promise));
    doc.addEventListener(DATA_STALE_EVENT, (e) => (e as CustomEvent<DataStaleDetail>).detail.wait(b.promise));
    let done = false;
    const p = call('POST')({}).then(() => {
      done = true;
    });
    a.resolve();
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    b.resolve();
    await p;
    expect(done).toBe(true);
  });

  it('with no listener handing anything over, resolves as before', async () => {
    const { seen } = page();
    expect(await call('DELETE')({})).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
  });

  it('the paths carry the base, and the page is covered by a pattern too', async () => {
    const { seen } = page();
    vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/app/blog/hola' });
    await call('GET', ['/blog/:slug'], '/app/')();
    expect(seen.map((d) => d.paths)).toEqual([['/app/blog/:slug']]);
  });

  it('criterion 18: a GET without invalidates never dispatches', async () => {
    const { seen } = page();
    expect(await call('GET')()).toEqual({ ok: true });
    expect(seen).toHaveLength(0);
  });

  it('a GET whose invalidates do not cover the current page does not dispatch', async () => {
    const { seen } = page();
    await call('GET', ['/blog', '/blog/:slug'])();
    expect(seen).toHaveLength(0);
  });

  it('a failed call does not dispatch', async () => {
    const { seen } = page();
    vi.stubGlobal('fetch', async () => new Response('{"status":409,"title":"Conflict"}', { status: 409 }));
    await expect(call('PUT')({})).rejects.toMatchObject({ status: 409 });
    expect(seen).toHaveLength(0);
  });
});

describe('announceStale', () => {
  it('without a document there is no page to tell', async () => {
    // The node environment of this suite has no `document` until a test stubs one.
    expect('document' in globalThis).toBe(false);
    await expect(announceStale(['/usuarios'])).resolves.toBeUndefined();
  });

  it('with nothing covering the page, dispatches nothing', async () => {
    const { seen } = page();
    await announceStale([]);
    await announceStale(['/otra', '/blog/:slug']);
    expect(seen).toHaveLength(0);
  });

  it('a wait that rejects makes the announcement reject', async () => {
    const { doc } = page();
    doc.addEventListener(DATA_STALE_EVENT, (e) =>
      (e as CustomEvent<DataStaleDetail>).detail.wait(Promise.reject(new Error('repaint failed'))),
    );
    await expect(announceStale(['/usuarios'])).rejects.toThrow('repaint failed');
  });
});
