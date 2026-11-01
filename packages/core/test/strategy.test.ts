import { describe, it, expect } from 'vitest';
import { strategy } from '../src/strategy.js';

describe('strategy', () => {
  it('is a no-op that returns undefined', () => {
    expect(strategy({ mode: 'sw', data: { ttl: '5m' } })).toBeUndefined();
  });
});
