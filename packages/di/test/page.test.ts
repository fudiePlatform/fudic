import { describe, expect, it } from 'vitest';

import { injectFrom, provideIn, token } from '../src/index.js';
import { buildTree } from '../src/page.js';
import type { Container } from '../src/types.js';

/**
 * Not a line of this file names `document`, and that is the criterion rather than a
 * coincidence: the tree comes from the emitted map, never from the element tree.
 */

const CART = token<{ readonly id: number }>('cart');

describe('buildTree', () => {
  it('builds the chain the map describes, and registers once per node', () => {
    const seen: number[] = [];
    let made = 0;

    const tree = buildTree([-1, 0, 0, 1], (node, container) => {
      seen.push(node);
      if (node === 1) provideIn(container, CART, () => ({ id: ++made }));
    });

    expect(tree).toHaveLength(4);
    expect(seen).toEqual([0, 1, 2, 3]);

    // Node 3 hangs from node 1, which owns CART: it climbs one link and stops there.
    expect(injectFrom(tree[3] as Container, CART)).toBe(injectFrom(tree[1] as Container, CART));
    // Node 2 hangs from the root instead, and never sees node 1's registration.
    expect(injectFrom(tree[2] as Container, CART, { optional: true })).toBeUndefined();
    expect(made).toBe(1);
  });

  it('gives the root the seed, and only the root', () => {
    const LOCALE = token<string>('locale');
    const tree = buildTree([-1, 0], () => {}, { locale: 'es-ES' });

    expect(injectFrom(tree[0] as Container, LOCALE)).toBe('es-ES');
    expect(injectFrom(tree[1] as Container, LOCALE)).toBe('es-ES');
  });

  it('produces just the root for an empty map, and everything resolves globally', () => {
    const GLOBAL = token<string>('global');
    const tree = buildTree([-1], (_node, container) => {
      provideIn(container, GLOBAL, () => 'root-owned');
    });

    expect(tree).toHaveLength(1);
    expect(injectFrom(tree[0] as Container, GLOBAL)).toBe('root-owned');
  });
});
