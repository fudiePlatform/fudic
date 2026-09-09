import { describe, expect, it } from 'vitest';
import { injectFrom, provideIn, token } from '@fudic/di';

import { iocIsEmpty, iocRoot } from '../src/ioc.js';
import { SsrDom } from '../src/ssr-dom.js';

/**
 * The container tree as the server builds it: lexically, while it renders, numbering each
 * container it creates so the browser can rebuild the same chain from the published map —
 * never from the element tree.
 */
describe('iocRoot', () => {
  it('numbers the containers it hands out and records the chain', () => {
    const root = iocRoot();
    const a = root.child('app-a');
    const b = root.child('app-b');
    const leaf = a.child('app-leaf');

    expect([root.index, a.index, b.index, leaf.index]).toEqual([0, 1, 2, 3]);
    expect(root.map()).toEqual([
      [-1, 0, 0, 1],
      ['', 'app-a', 'app-b', 'app-leaf'],
    ]);
  });

  it('is a container: a descendant resolves to the ancestor that owns the token', () => {
    const CART = token<{ readonly id: number }>('cart');
    const root = iocRoot();
    const owner = root.child('app-a');
    provideIn(owner, CART, () => ({ id: 1 }));

    expect(injectFrom(owner.child('app-leaf'), CART)).toBe(injectFrom(owner, CART));
    expect(injectFrom(root, CART, { optional: true })).toBeUndefined();
  });

  it('serves the seed from the root', () => {
    const LINES = token<readonly string[]>('lines');
    const root = iocRoot({ lines: ['a'] });
    expect(injectFrom(root.child('app-a'), LINES)).toEqual(['a']);
  });

  it('reports a map with nothing but the root as empty', () => {
    const root = iocRoot();
    expect(iocIsEmpty(root.map())).toBe(true);
    root.child('app-a');
    expect(iocIsEmpty(root.map())).toBe(false);
  });
});

describe('the payload slice', () => {
  it('carries the container node LAST, behind the props and the cells', () => {
    const dom = new SsrDom();
    const host = dom.element('app-a');
    dom.claim(host);
    const shadow = dom.attachShadow(host);
    const cell = (): number => 1;

    dom.state(shadow, ['title'], [{ of: cell, value: 1 }], 7);

    expect(dom.hydrationState()).toEqual({ offsets: [0, 3], data: ['title', 1, 7] });
  });

  it('carries nothing extra when the instance injects nothing', () => {
    const dom = new SsrDom();
    const host = dom.element('app-a');
    dom.claim(host);
    dom.state(dom.attachShadow(host), ['title']);

    expect(dom.hydrationState()).toEqual({ offsets: [0, 1], data: ['title'] });
  });
});
