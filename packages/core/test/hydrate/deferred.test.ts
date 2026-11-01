import { describe, it, expect } from 'vitest';
import { browserDom } from '@fudic/dom';
import {
  deferredOnce,
  importDeferred,
  type DeferredPieces,
} from '../../src/hydrate/deferred.js';
import { signal } from '../../src/signal.js';

describe('importDeferred', () => {
  it('hands back the DOM adapter and the signal, not their module namespaces', async () => {
    const pieces = await importDeferred();

    expect(pieces.dom).toBe(browserDom);
    expect(pieces.signal).toBe(signal);
  });
});

describe('deferredOnce', () => {
  it('shares one request between a caller that arrives while it is in flight and later ones', async () => {
    let asked = 0;
    let release = (_pieces: DeferredPieces): void => {};
    const pending = new Promise<DeferredPieces>((resolve) => {
      release = resolve;
    });
    const once = deferredOnce(() => {
      asked += 1;
      return pending;
    });

    const first = once();
    const second = once();
    expect(asked).toBe(1);

    const pieces: DeferredPieces = { dom: browserDom, signal };
    release(pieces);

    expect(await first).toBe(pieces);
    expect(await second).toBe(pieces);
    expect(await once()).toBe(pieces);
    expect(asked).toBe(1);
  });

  it('forgets a failure, so the next caller asks again', async () => {
    const pieces: DeferredPieces = { dom: browserDom, signal };
    let asked = 0;
    const once = deferredOnce(async () => {
      asked += 1;
      if (asked === 1) throw new Error('offline');
      return pieces;
    });

    await expect(once()).rejects.toThrow('offline');
    expect(await once()).toBe(pieces);
    expect(asked).toBe(2);
  });
});
