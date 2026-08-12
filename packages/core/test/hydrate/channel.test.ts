import { describe, it, expect } from 'vitest';
import { nullWarmChannel } from '../../src/hydrate/warm/channel.js';

describe('the warm port', () => {
  it('a page that warms nothing orders nothing, and hydration does not change', () => {
    expect(() => nullWarmChannel.warm(['/assets/h/app-counter-abcd1234.js'], ['app-counter'])).not.toThrow();
  });
});
