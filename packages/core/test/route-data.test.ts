/**
 * `onStaleData` — the route's half of the repaint after a call (SDD-68 §4.8, steps 2 and 4).
 *
 * The stub dispatches `DATA_STALE_EVENT` on `document`; here the test does, with a `wait` that
 * records what it was handed. `load` is a fake whose requests the test answers by hand, so the
 * race between two notices can be played in either order.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_STALE_EVENT, type DataStaleDetail } from '@fudic/conventions';
import { onStaleData, type DataSource } from '../src/route-data.js';

interface Request<D> {
  readonly path: string;
  readonly signal: AbortSignal | undefined;
  resolve(data: D): void;
  reject(reason: unknown): void;
}

function fakeLoad<D>(): { load: DataSource<D>; requests: Request<D>[] } {
  const requests: Request<D>[] = [];
  const load: DataSource<D> = {
    fetch: (path, signal) =>
      new Promise<D>((resolve, reject) => {
        requests.push({ path, signal, resolve, reject });
      }),
  };
  return { load, requests };
}

/** Dispatch the notice the stub would, and hand back what the listeners asked to wait for. */
function announce(): Promise<void>[] {
  const waits: Promise<void>[] = [];
  const detail: DataStaleDetail = { paths: ['/usuarios'], wait: (done) => void waits.push(done) };
  document.dispatchEvent(new CustomEvent(DATA_STALE_EVENT, { detail }));
  return waits;
}

let reload: ReturnType<typeof vi.fn>;
let off: (() => void) | undefined;

beforeEach(() => {
  reload = vi.fn();
  vi.stubGlobal('location', { pathname: '/usuarios', reload });
});
afterEach(() => {
  off?.();
  off = undefined;
  vi.unstubAllGlobals();
});

describe('onStaleData', () => {
  it('asks load for the current path, applies the answer, and the wait settles after it', async () => {
    const { load, requests } = fakeLoad<{ n: number }>();
    const applied: { n: number }[] = [];
    off = onStaleData(load, (data) => void applied.push(data));

    const waits = announce();
    expect(waits).toHaveLength(1);
    expect(requests.map((r) => r.path)).toEqual(['/usuarios']);
    expect(requests[0]!.signal).toBeInstanceOf(AbortSignal);
    expect(applied).toEqual([]);

    requests[0]!.resolve({ n: 1 });
    await waits[0];
    expect(applied).toEqual([{ n: 1 }]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('a newer notice aborts the older request, whose late answer is never applied', async () => {
    const { load, requests } = fakeLoad<string>();
    const applied: string[] = [];
    off = onStaleData(load, (data) => void applied.push(data));

    const [first] = announce();
    const [second] = announce();
    expect(requests[0]!.signal!.aborted).toBe(true);
    expect(requests[1]!.signal!.aborted).toBe(false);

    requests[1]!.resolve('new');
    await second;
    requests[0]!.resolve('old');
    await first;
    expect(applied).toEqual(['new']);
  });

  it('a failed refresh reloads the document, and the wait still settles', async () => {
    const { load, requests } = fakeLoad<string>();
    const apply = vi.fn();
    off = onStaleData(load, apply);
    const [wait] = announce();
    requests[0]!.reject(new Error('500'));
    await expect(wait).resolves.toBeUndefined();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
  });

  it('a replaced request that fails (its abort) reloads nothing', async () => {
    const { load, requests } = fakeLoad<string>();
    off = onStaleData(load, vi.fn());
    const [first] = announce();
    announce();
    requests[0]!.reject(new DOMException('aborted', 'AbortError'));
    await first;
    expect(reload).not.toHaveBeenCalled();
  });

  it('the teardown aborts the refresh in flight and stops listening', async () => {
    const { load, requests } = fakeLoad<string>();
    const apply = vi.fn();
    const teardown = onStaleData(load, apply);
    const [wait] = announce();
    teardown();
    expect(requests[0]!.signal!.aborted).toBe(true);
    requests[0]!.reject(new DOMException('aborted', 'AbortError'));
    await wait;
    expect(reload).not.toHaveBeenCalled();
    expect(announce()).toEqual([]);
    expect(requests).toHaveLength(1);
  });

  it('a teardown with nothing in flight just stops listening', () => {
    const { load, requests } = fakeLoad<string>();
    const teardown = onStaleData(load, vi.fn());
    teardown();
    expect(announce()).toEqual([]);
    expect(requests).toHaveLength(0);
  });
});
