/**
 * What one page publishes, and whose page it is.
 *
 * The table hangs off the root container and nowhere else, so two pages being built at the
 * same time — two requests on a server — have two tables. Held by the module instead, one
 * response would be handed the other's values, which is a leak between visitors and not a
 * detail of bookkeeping.
 */

import { describe, expect, it } from 'vitest';

import { createChild, createRoot, injectFrom, publishIn, seedOf, token } from '../src/index.js';

describe('publishing into a page', () => {
  it('writes by token NAME, and a resolution finds it with no registration at all', () => {
    const USER = token<string>('user');
    const root = createRoot();

    publishIn(root, USER, 'ana');

    expect(seedOf(root)).toEqual({ user: 'ana' });
    expect(injectFrom(root, USER)).toBe('ana');
  });

  it('climbs to the root from any container of the page', () => {
    const USER = token<string>('user');
    const root = createRoot();
    const deep = createChild(createChild(root, 'app-a'), 'app-b');

    // A component holds the container it was handed, never the root.
    publishIn(deep, USER, 'ana');

    expect(seedOf(root)).toEqual({ user: 'ana' });
    expect(seedOf(deep)).toBe(seedOf(root));
    expect(injectFrom(deep, USER)).toBe('ana');
  });

  it('keeps two pages built at the same time apart', () => {
    const USER = token<string>('user');
    const slow = createRoot();
    const fast = createRoot();

    // Interleaved on purpose: `fast` opened second and published first, which is what an
    // `await` inside the first page's `load` produces on a server answering both.
    publishIn(fast, USER, 'luis');
    publishIn(slow, USER, 'ana');

    expect(injectFrom(slow, USER)).toBe('ana');
    expect(injectFrom(fast, USER)).toBe('luis');
  });

  it('starts from what the page was seeded with, without writing into it', () => {
    const LINES = token<readonly string[]>('lines');
    const USER = token<string>('user');
    const given = { lines: ['a', 'b'] };
    const root = createRoot(given);

    publishIn(root, USER, 'ana');

    expect(injectFrom(root, LINES)).toEqual(['a', 'b']);
    expect(seedOf(root)).toEqual({ lines: ['a', 'b'], user: 'ana' });
    // The browser hands over the parsed `fud-di` block; it is not the container's to write.
    expect(given).toEqual({ lines: ['a', 'b'] });
  });

  it('is empty on a page that published nothing', () => {
    expect(seedOf(createRoot())).toEqual({});
  });
});
