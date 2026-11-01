import { describe, it, expect, vi } from 'vitest';

// Both pieces are requested before either answers: two awaits in a row would be two round
// trips, invisible on localhost and the whole cost on a slow link. A file of its own because
// both modules are mocked here and imported for real everywhere else.

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
