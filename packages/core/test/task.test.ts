/**
 * `task` — a call with its cancellation, its state and its order (SDD-68 §6, criteria 1–10
 * and the `core` half of 12).
 *
 * Every test drives a fake `fn` by hand: each call is recorded with its arguments and its
 * signal, and stays pending until the test resolves or rejects it. That is what lets a test
 * make the FIRST call answer after the second, which is the bug `latest` exists to prevent.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Callable, effect, owned, signal, subscribe, task } from '../src/index.js';
import { isSource } from '../src/tracking.js';

interface Call<A, R> {
  readonly args: A;
  readonly signal: AbortSignal;
  resolve(value: R): void;
  reject(reason: unknown): void;
}

interface Fake<A, R> {
  readonly fn: Callable<A, R>;
  readonly calls: Call<A, R>[];
}

/**
 * A `fn` the test settles by hand. `respectAbort` makes it reject with an AbortError when
 * its signal fires, the way `fetch` does; without it, it ignores the signal entirely.
 */
function fake<A, R>(options: { readonly method?: string; readonly respectAbort?: boolean } = {}): Fake<A, R> {
  const calls: Call<A, R>[] = [];
  const call = (args: A, { signal }: { readonly signal: AbortSignal }): Promise<R> =>
    new Promise<R>((resolve, reject) => {
      calls.push({ args, signal, resolve, reject });
      if (options.respectAbort === true) {
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }
    });
  const fn: Callable<A, R> = options.method === undefined ? call : Object.assign(call, { method: options.method });
  return { fn, calls };
}

/** Let every queued microtask and promise chain run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

/** The call at `index`, which the test knows was made. */
function at<A, R>(calls: Call<A, R>[], index: number): Call<A, R> {
  const call = calls[index];
  if (call === undefined) throw new Error(`no call #${index} (made ${calls.length})`);
  return call;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('task, latest (criteria 1–4)', () => {
  it('1. the last call wins: the first one is aborted and its run resolves undefined', async () => {
    const { fn, calls } = fake<string, string>({ respectAbort: true });
    const t = task(fn);
    const first = t.run('an');
    const second = t.run('ana');
    expect(calls.map((c) => c.args)).toEqual(['an', 'ana']);
    expect(at(calls, 0).signal.aborted).toBe(true);
    expect(at(calls, 1).signal.aborted).toBe(false);

    at(calls, 1).resolve('result:ana');
    at(calls, 0).resolve('result:an'); // too late, and already rejected by its abort
    expect(await second).toBe('result:ana');
    expect(await first).toBeUndefined();
    await flush();
    expect(t.value()).toBe('result:ana');
    expect(t.state()).toBe('done');
    expect(t.error()).toBeUndefined();
  });

  it('2. the same when fn ignores the signal and answers late', async () => {
    const { fn, calls } = fake<string, string>();
    const t = task(fn);
    const first = t.run('an');
    const second = t.run('ana');
    expect(at(calls, 0).signal.aborted).toBe(true);

    at(calls, 1).resolve('result:ana');
    expect(await second).toBe('result:ana');
    at(calls, 0).resolve('result:an'); // answers after the good one: never written
    expect(await first).toBeUndefined();
    await flush();
    expect(t.value()).toBe('result:ana');
    expect(t.state()).toBe('done');
  });

  it('2b. a replaced run resolves right away, even if its fn never settles', async () => {
    const { fn, calls } = fake<string, string>();
    const t = task(fn);
    const first = t.run('an');
    void t.run('ana');
    expect(await first).toBeUndefined();
    at(calls, 1).resolve('ok');
    await flush();
    expect(t.state()).toBe('done');
  });

  it('3. with source: creating does not call, a change calls once, what fn reads does not count', async () => {
    const texto = signal('');
    const inside = signal(0);
    const calls: { q: string }[] = [];
    const fn: Callable<{ q: string }, number> = (args) => {
      calls.push(args);
      return Promise.resolve(inside()); // a read the task must not depend on
    };
    const t = task(fn, () => ({ q: texto() }));
    expect(calls).toEqual([]);
    expect(t.state()).toBe('idle');

    texto.set('a');
    expect(calls).toEqual([{ q: 'a' }]);
    await flush();
    expect(t.value()).toBe(0);

    inside.set(1);
    await flush();
    expect(calls).toEqual([{ q: 'a' }]);

    texto.set('ab');
    expect(calls).toEqual([{ q: 'a' }, { q: 'ab' }]);
  });

  it('3b. a task with source still takes run by hand', async () => {
    const texto = signal('x');
    const { fn, calls } = fake<{ q: string }, string>();
    const t = task(fn, () => ({ q: texto() }));
    const answer = t.run({ q: 'manual' });
    expect(at(calls, 0).args).toEqual({ q: 'manual' });
    at(calls, 0).resolve('m');
    expect(await answer).toBe('m');
  });

  it('4. initial is the value before the first answer and stays while a call is in flight', async () => {
    const { fn, calls } = fake<string, readonly string[]>();
    const t = task(fn, undefined, { initial: [] as readonly string[] });
    expect(t.value()).toEqual([]);

    void t.run('a');
    expect(t.value()).toEqual([]);
    expect(t.pending()).toBe(true);
    at(calls, 0).resolve(['ana']);
    await flush();
    expect(t.value()).toEqual(['ana']);

    void t.run('b');
    expect(t.state()).toBe('pending');
    expect(t.value()).toEqual(['ana']);
  });

  it('4b. without initial, value is undefined until the first answer', () => {
    const { fn } = fake<string, string>();
    expect(task(fn).value()).toBeUndefined();
  });

  it('a GET is latest by default', () => {
    const { fn, calls } = fake<string, string>({ method: 'GET' });
    const t = task(fn);
    void t.run('a');
    void t.run('b');
    expect(calls).toHaveLength(2);
    expect(at(calls, 0).signal.aborted).toBe(true);
  });

  it('the reads are tracked: an effect over them reruns', async () => {
    const { fn, calls } = fake<string, string>();
    const t = task(fn);
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(`${t.state()}|${String(t.value())}|${String(t.pending())}|${String(t.error())}`);
    });
    void t.run('a');
    at(calls, 0).resolve('A');
    await flush();
    expect(seen[0]).toBe('idle|undefined|false|undefined');
    expect(seen).toContain('pending|undefined|true|undefined');
    expect(seen.at(-1)).toBe('done|A|false|undefined');
    stop();
  });
});

describe('the accessors are sources (SDD-68 §4.7)', () => {
  it('each one is a reactive source the emit can subscribe to', async () => {
    const { fn, calls } = fake<string, string>();
    const t = task(fn);
    for (const read of [t.value, t.state, t.pending, t.error]) {
      expect(isSource(read)).toBe(true);
    }
    const states: string[] = [];
    const values: unknown[] = [];
    const off = [subscribe(t.state, (s) => void states.push(s)), subscribe(t.value, (v) => void values.push(v))];
    void t.run('a');
    at(calls, 0).resolve('A');
    await flush();
    expect(states).toEqual(['pending', 'done']);
    expect(values).toEqual(['A']);
    for (const o of off) o();
  });
});

describe('task, queue (criteria 5–7)', () => {
  it('5. a PUT queues: each call leaves when the previous settles, none is aborted', async () => {
    const { fn, calls } = fake<number, string>({ method: 'PUT' });
    const t = task(fn);
    const runs = [t.run(1), t.run(2), t.run(3)];
    await flush();
    expect(calls.map((c) => c.args)).toEqual([1]);

    at(calls, 0).resolve('one');
    await flush();
    expect(calls.map((c) => c.args)).toEqual([1, 2]);
    expect(t.value()).toBe('one');
    expect(t.state()).toBe('pending');

    at(calls, 1).resolve('two');
    await flush();
    expect(calls.map((c) => c.args)).toEqual([1, 2, 3]);

    at(calls, 2).resolve('three');
    expect(await Promise.all(runs)).toEqual(['one', 'two', 'three']);
    expect(calls.every((c) => !c.signal.aborted)).toBe(true);
    expect(t.value()).toBe('three');
    expect(t.state()).toBe('done');
  });

  it.each(['POST', 'PATCH', 'DELETE'])('%s queues by default', async (method) => {
    const { fn, calls } = fake<number, string>({ method });
    const t = task(fn);
    void t.run(1);
    void t.run(2);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it('6. a failure does not stop the next one, and the round ends done when the last succeeds', async () => {
    const { fn, calls } = fake<number, string>({ method: 'PUT' });
    const t = task(fn);
    const first = t.run(1);
    const second = t.run(2);
    await flush();
    at(calls, 0).reject(new Error('first failed'));
    await flush();
    expect(calls).toHaveLength(2);
    expect(t.state()).toBe('pending'); // one still outstanding: nothing published yet
    expect(t.error()).toBeUndefined();
    at(calls, 1).resolve('two');
    expect(await first).toBeUndefined();
    expect(await second).toBe('two');
    expect(t.state()).toBe('done');
    expect(t.error()).toBeUndefined();
    expect(t.value()).toBe('two');
  });

  it('6b. the round ends failed when the last one fails, keeping the earlier value', async () => {
    const { fn, calls } = fake<number, string>({ method: 'POST' });
    const t = task(fn);
    void t.run(1);
    const second = t.run(2);
    await flush();
    at(calls, 0).resolve('one');
    await flush();
    const boom = new Error('second failed');
    at(calls, 1).reject(boom);
    expect(await second).toBeUndefined();
    expect(t.state()).toBe('failed');
    expect(t.error()).toBe(boom);
    expect(t.value()).toBe('one');
  });

  it("7. mode: 'latest' over a PUT behaves as latest", () => {
    const { fn, calls } = fake<number, string>({ method: 'PUT' });
    const t = task(fn, undefined, { mode: 'latest' });
    void t.run(1);
    void t.run(2);
    expect(calls).toHaveLength(2);
    expect(at(calls, 0).signal.aborted).toBe(true);
  });

  it("7b. mode: 'queue' over a GET behaves as queue", async () => {
    const { fn, calls } = fake<number, string>({ method: 'GET' });
    const t = task(fn, undefined, { mode: 'queue' });
    void t.run(1);
    void t.run(2);
    await flush();
    expect(calls).toHaveLength(1);
    at(calls, 0).resolve('one');
    await flush();
    expect(calls).toHaveLength(2);
    expect(at(calls, 0).signal.aborted).toBe(false);
  });

  it("7c. mode: 'queue' over a callable without method behaves as queue", async () => {
    const { fn, calls } = fake<number, string>();
    const t = task(fn, undefined, { mode: 'queue' });
    void t.run(1);
    void t.run(2);
    await flush();
    expect(calls).toHaveLength(1);
  });
});

describe('state, error and cancel (criteria 8–10)', () => {
  it('8. the table of §4.4, row by row', async () => {
    const { fn, calls } = fake<string, string>({ respectAbort: true });
    const t = task(fn, undefined, { initial: 'init' });

    // Created.
    expect([t.state(), t.value(), t.error()]).toEqual(['idle', 'init', undefined]);

    // cancel() with nothing in flight: no change.
    t.cancel();
    expect([t.state(), t.value(), t.error()]).toEqual(['idle', 'init', undefined]);

    // A call leaves.
    void t.run('a');
    expect([t.state(), t.value(), t.error()]).toEqual(['pending', 'init', undefined]);

    // The answer arrives.
    at(calls, 0).resolve('A');
    await flush();
    expect([t.state(), t.value(), t.error()]).toEqual(['done', 'A', undefined]);

    // It fails.
    const boom = new Error('boom');
    void t.run('b');
    at(calls, 1).reject(boom);
    await flush();
    expect([t.state(), t.value(), t.error()]).toEqual(['failed', 'A', boom]);

    // A new call leaves after a failure: the error is cleared, the value kept.
    void t.run('c');
    expect([t.state(), t.value(), t.error()]).toEqual(['pending', 'A', undefined]);

    // cancel() with something in flight.
    t.cancel();
    expect([t.state(), t.value(), t.error()]).toEqual(['cancelled', 'A', undefined]);
    await flush();
    expect([t.state(), t.value(), t.error()]).toEqual(['cancelled', 'A', undefined]);

    // cancel() with nothing in flight, after a cancel: still no change.
    t.cancel();
    expect(t.state()).toBe('cancelled');
  });

  it('8b. cancel() after done changes nothing', async () => {
    const { fn, calls } = fake<string, string>();
    const t = task(fn);
    void t.run('a');
    at(calls, 0).resolve('A');
    await flush();
    t.cancel();
    expect([t.state(), t.value(), t.error()]).toEqual(['done', 'A', undefined]);
  });

  it('9. cancel() in flight: cancelled, the signal aborted, no error; run resolves undefined', async () => {
    const { fn, calls } = fake<string, string>({ respectAbort: true });
    const t = task(fn);
    const running = t.run('a');
    t.cancel();
    expect(t.state()).toBe('cancelled');
    expect(at(calls, 0).signal.aborted).toBe(true);
    expect(await running).toBeUndefined();
    await flush();
    expect(t.error()).toBeUndefined();
    expect(t.state()).toBe('cancelled');
  });

  it('9b. cancel() in flight with a fn that ignores the abort: its late answer is never written', async () => {
    const { fn, calls } = fake<string, string>();
    const t = task(fn, undefined, { initial: 'init' });
    const running = t.run('a');
    t.cancel();
    expect(await running).toBeUndefined();
    at(calls, 0).resolve('late');
    await flush();
    expect(t.value()).toBe('init');
    expect(t.state()).toBe('cancelled');
  });

  it('9c. in queue, cancel drops the waiting calls: never called, their runs resolve undefined', async () => {
    const { fn, calls } = fake<number, string>({ method: 'PUT' });
    const t = task(fn);
    const runs = [t.run(1), t.run(2), t.run(3)];
    await flush();
    expect(calls).toHaveLength(1);
    t.cancel();
    expect(t.state()).toBe('cancelled');
    expect(at(calls, 0).signal.aborted).toBe(true);
    expect(await Promise.all(runs)).toEqual([undefined, undefined, undefined]);
    at(calls, 0).resolve('late'); // ignored the abort
    await flush();
    expect(calls).toHaveLength(1);
    expect(t.value()).toBeUndefined();
  });

  it('9d. in queue, cancel before the first call left the tail: nothing is ever called', async () => {
    const { fn, calls } = fake<number, string>({ method: 'PUT' });
    const t = task(fn);
    const running = t.run(1); // scheduled on the tail, not on the wire yet
    t.cancel();
    expect(t.state()).toBe('cancelled');
    expect(await running).toBeUndefined();
    await flush();
    expect(calls).toHaveLength(0);
  });

  it('9e. in queue, a call made after cancel is not held back by a call that ignored its abort', async () => {
    const { fn, calls } = fake<number, string>({ method: 'PUT' });
    const t = task(fn);
    void t.run(1);
    await flush();
    t.cancel(); // call #0 never settles
    const next = t.run(2);
    await flush();
    expect(calls.map((c) => c.args)).toEqual([1, 2]);
    at(calls, 1).resolve('two');
    expect(await next).toBe('two');
    expect(t.state()).toBe('done');
  });

  it('10. a rejection that is not an abort: failed, error set, run resolves undefined, nothing unhandled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const { fn, calls } = fake<string, string>();
      const t = task(fn);
      const running = t.run('a');
      const boom = new Error('boom');
      at(calls, 0).reject(boom);
      expect(await running).toBeUndefined();
      expect(t.state()).toBe('failed');
      expect(t.error()).toBe(boom);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('10b. a fn that throws synchronously fails the same way', async () => {
    const boom = new Error('sync');
    const fn: Callable<string, string> = () => {
      throw boom;
    };
    const t = task(fn);
    expect(await t.run('a')).toBeUndefined();
    expect(t.state()).toBe('failed');
    expect(t.error()).toBe(boom);
  });

  it('10c. an abort is never an error, even when fn rejects with it', async () => {
    const { fn, calls } = fake<string, string>({ respectAbort: true });
    const t = task(fn);
    void t.run('a');
    void t.run('b'); // aborts 'a', which rejects with AbortError
    await flush();
    expect(t.error()).toBeUndefined();
    at(calls, 1).resolve('B');
    await flush();
    expect(t.state()).toBe('done');
  });
});

describe('disposal (criterion 12, the core half)', () => {
  it('disposing the owner aborts the call in flight, stops the effect, and makes run inert', async () => {
    vi.useFakeTimers();
    const { fn, calls } = fake<string, string>({ respectAbort: true });
    const ticks = signal(0);
    const [t, disposers] = owned(() => {
      const t = task(fn);
      effect(() => {
        const id = setInterval(() => {
          ticks.set(ticks() + 1);
        }, 1000);
        return () => {
          clearInterval(id);
        };
      });
      return t;
    });
    const running = t.run('a');
    vi.advanceTimersByTime(2000);
    expect(ticks()).toBe(2);

    for (const dispose of disposers) dispose();
    expect(at(calls, 0).signal.aborted).toBe(true);
    expect(await running).toBeUndefined();
    vi.advanceTimersByTime(5000);
    expect(ticks()).toBe(2);

    expect(await t.run('b')).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('a disposed task with source stops listening to it', async () => {
    const texto = signal('');
    const { fn, calls } = fake<{ q: string }, string>();
    const [t, disposers] = owned(() => task(fn, () => ({ q: texto() })));
    texto.set('a');
    expect(calls).toHaveLength(1);
    for (const dispose of disposers) dispose();
    texto.set('ab');
    await flush();
    expect(calls).toHaveLength(1);
    expect(t.state()).toBe('cancelled');
  });

  it('a disposed task with nothing outstanding keeps its state', async () => {
    const { fn, calls } = fake<string, string>();
    const [t, disposers] = owned(() => task(fn));
    void t.run('a');
    at(calls, 0).resolve('A');
    await flush();
    for (const dispose of disposers) dispose();
    expect(t.state()).toBe('done');
    expect(t.value()).toBe('A');
  });

  it('a task created outside owned has no owner', () => {
    const [, disposers] = owned(() => undefined);
    const { fn } = fake<string, string>();
    task(fn);
    expect(disposers).toEqual([]);
  });
});
