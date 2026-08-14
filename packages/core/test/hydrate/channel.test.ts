import { describe, it, expect } from 'vitest';
import {
  announceWarmed,
  nullWarmChannel,
  WARMED_EVENT,
  type WarmedDetail,
} from '../../src/hydrate/warm/channel.js';

describe('the warm port', () => {
  it('a page that warms nothing orders nothing, and hydration does not change', () => {
    expect(() => nullWarmChannel.warm(['/assets/h/app-counter-abcd1234.js'], ['app-counter'])).not.toThrow();
  });

  it('reports a deposited chunk by tag, which is the only thing a page can act on', () => {
    const seen: WarmedDetail[] = [];
    document.addEventListener(WARMED_EVENT, (e) => {
      seen.push((e as CustomEvent<WarmedDetail>).detail);
    });

    announceWarmed(document, 'app-counter');

    expect(seen).toEqual([{ tag: 'app-counter' }]);
  });
});
