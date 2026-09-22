import { describe, it, expect } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  deferredOnce,
  importDeferred,
  type DeferredPieces,
} from '../../src/hydrate/deferred.js';
import { signal } from '../../src/signal.js';

/**
 * What the load does NOT pay for (SDD-45 §4.4.1).
 *
 * The real request has its own test on purpose. It is injected in `install.test.ts`,
 * `route.test.ts` and `cells.test.ts`, because what those suites are about is the ORDER the
 * pieces are awaited in and not the fetching of them — so without a test here the one
 * function a browser actually runs sits at zero.
 */

describe('importDeferred', () => {
  it('hands back the two pieces of §4.4.1, unwrapped', async () => {
    const pieces = await importDeferred();

    // Unwrapped, and that matters: what the caller gets is the adapter and the factory, not
    // two module namespaces it would have to know the export names of.
    expect(pieces.dom).toBe(browserDom);
    expect(pieces.signal).toBe(signal);
  });

});

describe('deferredOnce', () => {
  it('memoises the PROMISE, so whoever arrives second waits on what is in flight', async () => {
    let asked = 0;
    let release = (_pieces: DeferredPieces): void => {};
    const pending = new Promise<DeferredPieces>((resolve) => {
      release = resolve;
    });
    const once = deferredOnce(() => {
      asked += 1;
      return pending;
    });

    // The warm channel orders them when a component comes into view; path 2 awaits them at
    // its top. A page that does both has to make ONE download of it, and the only way is for
    // the memo to hold the promise rather than the result — the second caller arrives while
    // the first request is still in the air.
    const first = once();
    const second = once();
    expect(asked).toBe(1);

    const pieces: DeferredPieces = { dom: browserDom, signal };
    release(pieces);

    expect(await first).toBe(pieces);
    expect(await second).toBe(pieces);

    // And a third caller, after it landed, does not ask either.
    expect(await once()).toBe(pieces);
    expect(asked).toBe(1);
  });
});
