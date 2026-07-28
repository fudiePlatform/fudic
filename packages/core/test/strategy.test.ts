/**
 * SDD-20 §3.7: `strategy()` is a marker. The build reads the call statically; at
 * runtime it must do nothing at all, so importing it from a page costs nothing.
 */

import { describe, it, expect } from 'vitest';
import { strategy } from '../src/strategy.js';

describe('strategy', () => {
  it('is a no-op that returns undefined', () => {
    expect(strategy({ mode: 'sw', data: { ttl: '5m' } })).toBeUndefined();
  });

  it('accepts an empty declaration', () => {
    expect(() => strategy({})).not.toThrow();
  });
});
