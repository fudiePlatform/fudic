import { describe, it, expect, vi } from 'vitest';

/**
 * ONE batch of two, and not a chain (SDD-45 §4.4.1, §1.5 rule 2).
 *
 * The two pieces have nothing to do with each other, so asking for them with two awaits
 * would discover the second only once the first answered — two round trips for two
 * independent modules, which is the very shape this SDD is spent removing. The difference is
 * invisible on localhost and is the whole cost on a slow link, so it is fixed here by
 * interleaving rather than by reading the source.
 *
 * Its own file because the two specifiers are mocked, and `../signal.js` is a module the rest
 * of the hydrate suite imports for real.
 */

const trace: string[] = [];

/** A module that takes a turn of the loop to arrive, like a download does. */
const slow = async <T>(name: string, value: T): Promise<T> => {
  trace.push(`ask:${name}`);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  trace.push(`got:${name}`);
  return value;
};

vi.mock('@fudic/dom', () => slow('dom', { browserDom: { mocked: 'dom' } }));
vi.mock('../../src/signal.js', () => slow('signal', { signal: (_v: unknown) => 'mocked-signal' }));

describe('importDeferred', () => {
  it('asks for both before either answers', async () => {
    const { importDeferred } = await import('../../src/hydrate/deferred.js');
    const pieces = await importDeferred();

    // Both asked, then both answered. A chain would read ask/got/ask/got.
    expect(trace).toEqual(['ask:dom', 'ask:signal', 'got:dom', 'got:signal']);
    // And both arrive UNWRAPPED: the caller gets the adapter and the factory, not two module
    // namespaces it would have to know the export names of.
    expect(pieces.dom).toEqual({ mocked: 'dom' });
    expect(pieces.signal(0)).toBe('mocked-signal');
  });
});
