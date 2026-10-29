/**
 * SDD-70 §3.4, §4.2 — the `later` fields of `load`: `runLoad` settles each one the moment `load`
 * returns. What the page awaits never rejects; a failure is a `Problem` by the rule of
 * `problemOf`, and a promise the view never awaits fails without an unhandled rejection.
 * Criteria 11, 13, 14 and 15, with promises resolved by hand.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadingFile, page, resetRegistry } from '../../src/contract/index.js';
import { runLoad, settleLater, type Settled } from '../../src/contract/server.js';
import { HttpError, notFound, redirect } from '../../src/errors.js';
import { serverCtx } from '../helpers.js';

afterEach(() => {
  loadingFile(undefined);
  resetRegistry();
  vi.restoreAllMocks();
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Whether a promise has settled, without waiting for it: a few microtask turns. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  return done;
}

/** A `load` of `routes/espera` with `users` and `stats` marked `later`. */
function laterLoad(handler: () => unknown) {
  const load = page<(ctx: never) => unknown>({ id: 'routes/espera', name: 'load', later: ['users', 'stats'] });
  load.handle(handler as never);
  return load;
}

describe('criterion 11 — the promises start when load is called, not when the view reaches them', () => {
  it('both are created by load and pending when it returns; each settles on its own', async () => {
    const users = deferred<string[]>();
    const stats = deferred<number>();
    const started: string[] = [];
    const load = laterLoad(() => {
      started.push('users', 'stats');
      return { title: 'Usuarios', users: users.promise, stats: stats.promise };
    });

    const data = (await runLoad(load, serverCtx('GET'))) as Record<string, Promise<Settled>>;
    // `load` has returned: both are running, neither has settled, and `runLoad` waited for none.
    expect(started).toEqual(['users', 'stats']);
    expect(data['title']).toBe('Usuarios');
    expect(await settled(data['users']!)).toBe(false);
    expect(await settled(data['stats']!)).toBe(false);

    // The second settles first, and it does not wait for the first.
    stats.resolve(12);
    expect(await data['stats']).toEqual({ ok: 12 });
    expect(await settled(data['users']!)).toBe(false);
    users.resolve(['Ana']);
    expect(await data['users']).toEqual({ ok: ['Ana'] });
  });

  it('a load without later fields hands back its data as it is', async () => {
    const value = Promise.resolve(1);
    const load = page<(ctx: never) => unknown>({ id: 'routes/x', name: 'load' });
    load.handle((() => ({ p: value })) as never);
    expect(((await runLoad(load, serverCtx('GET'))) as { p: unknown }).p).toBe(value);
  });
});

describe('criterion 13 — a later field that fails is a Problem for its @catch', () => {
  it('notFound() keeps its 404 and its title', async () => {
    const cause = notFound();
    const users = settleLater({ users: Promise.reject(cause) }, ['users'], false)['users'];
    expect(await users).toEqual({ error: { status: 404, title: 'Not Found' }, cause });
  });

  it('any other error is a 500, with its message in `detail` only in dev', async () => {
    const cause = new Error('db down');
    const prod = await settleLater({ users: Promise.reject(cause) }, ['users'], false)['users'];
    expect(prod).toEqual({ error: { status: 500, title: 'Internal Server Error' }, cause });
    const dev = await settleLater({ users: Promise.reject(cause) }, ['users'], true)['users'];
    expect(dev).toEqual({ error: { status: 500, title: 'Internal Server Error', detail: 'db down' }, cause });
  });

  it('a field that is not a promise settles with its value; the others are left alone', async () => {
    const out = settleLater({ users: ['Ana'], title: 't' }, ['users'], false);
    expect(out['title']).toBe('t');
    expect(await out['users']).toEqual({ ok: ['Ana'] });
  });

  it('a redirect lands there too, and in dev says it cannot be followed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const dev = (await settleLater({ users: Promise.reject(redirect('/login')) }, ['users'], true)['users']) as {
      error: { status: number };
    };
    expect(dev.error.status).toBe(303);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toBe(
      'fudic: the later field "users" redirected after the first byte; the page cannot follow it.',
    );

    await settleLater({ users: Promise.reject(redirect('/login')) }, ['users'], false)['users'];
    await settleLater({ users: Promise.reject(notFound()) }, ['users'], true)['users'];
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('through runLoad, in dev', async () => {
    const load = laterLoad(() => ({ users: Promise.reject(new Error('boom')), stats: 1 }));
    const data = (await runLoad(load, serverCtx('GET'), true)) as Record<string, Promise<Settled>>;
    expect(await data['users']).toMatchObject({ error: { status: 500, detail: 'boom' } });
    expect(await data['stats']).toEqual({ ok: 1 });
  });
});

describe('criterion 14 — what decides the status is resolved before the first byte', () => {
  it('a load that throws notFound() before returning still rejects with its 404', async () => {
    const load = laterLoad(() => {
      throw notFound();
    });
    const error = (await runLoad(load, serverCtx('GET')).catch((e: unknown) => e)) as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(404);
  });

  it('and so does an async one, whatever later fields it would have had', async () => {
    const load = laterLoad(async () => {
      await Promise.resolve();
      throw notFound();
    });
    await expect(runLoad(load, serverCtx('GET'))).rejects.toMatchObject({ status: 404 });
  });
});

describe('criterion 15 — a later field nobody awaits fails without an unhandled rejection', () => {
  it('rejected before load returns, or after, and never awaited', async () => {
    const unhandled: unknown[] = [];
    const listen = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', listen);
    try {
      const stats = deferred<number>();
      const load = laterLoad(() => ({ users: Promise.reject(new Error('early')), stats: stats.promise }));
      // The page never awaits either: its `@await` sits in a branch of `@if` that does not render.
      await runLoad(load, serverCtx('GET'));
      stats.reject(new Error('late'));
      // Node reports an unhandled rejection after the microtasks of a macrotask have drained.
      await new Promise<void>((r) => setImmediate(r));
      await new Promise<void>((r) => setImmediate(r));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });
});
