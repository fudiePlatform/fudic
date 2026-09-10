import { describe, expect, it } from 'vitest';

import { injectFrom, provide, token } from '../src/index.js';
import { containerOf } from '../src/page.js';

/**
 * A page whose route declares no provider publishes no map at all, so nothing ever calls
 * `buildTree`. Its own file, because what is being asserted is the state of the module
 * BEFORE anything builds a tree — and a test that shared a file with one that does would be
 * asserting the order the runner happened to pick.
 */
describe('a page with no published map', () => {
  it('opens the root on first ask, and every instance resolves globally', () => {
    const NOW = token<string>('now');
    provide(NOW, () => 'root-only');

    const root = containerOf(0);
    expect(containerOf()).toBe(root);
    expect(injectFrom(root, NOW)).toBe('root-only');
  });
});
