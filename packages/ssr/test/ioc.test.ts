import { describe, expect, it } from 'vitest';
import { injectFrom, provideIn, token } from '@fudic/di';

import { iocIsEmpty, iocRoot, withDi } from '../src/ioc.js';
import { openSeed, publish, publishedSeed, seedBlock } from '../src/seed.js';
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

describe('the seed', () => {
  it('publishes by token NAME into the table the response opened', () => {
    openSeed();
    publish(token<readonly string[]>('lines'), ['a', 'b']);
    publish(token<string>('locale'), 'es-ES');

    expect(publishedSeed()).toEqual({ lines: ['a', 'b'], locale: 'es-ES' });
    // The next response opens its own: what is left behind would cross on that one.
    expect(openSeed()).toEqual({});
    expect(publishedSeed()).toBeNull();
  });

  it('reaches the root container that opened it, however late it is written', () => {
    const LINES = token<readonly string[]>('late');
    const root = iocRoot();
    // `publish` happens inside `load`, which runs BEFORE the render — and after the root
    // was opened. The service the server builds still starts from the published value.
    publish(LINES, ['x']);
    expect(injectFrom(root, LINES)).toEqual(['x']);
  });

  it('writes a block only when something was published, and escapes it', () => {
    openSeed();
    expect(seedBlock()).toBe('');

    publish(token<string>('note'), '</script><b>');
    const block = seedBlock();
    expect(block).toContain('id="fud-di"');
    expect(block).not.toContain('</script><b>');
    expect(JSON.parse(block.slice(block.indexOf('>') + 1, block.lastIndexOf('<')))).toEqual({
      note: '</script><b>',
    });
  });
});

describe('withDi', () => {
  it('hangs the request container off ctx, and leaves ctx itself alone', () => {
    const NOW = token<string>('now');
    const MISSING = token<string>('missing');
    const root = iocRoot({ now: 'today' });
    const ctx = { params: { id: '7' } };

    const withIt = withDi(ctx, root);
    expect(withIt.params).toBe(ctx.params);
    expect(withIt.inject(NOW)).toBe('today');
    expect(withIt.inject(MISSING, { optional: true })).toBeUndefined();
  });
});
