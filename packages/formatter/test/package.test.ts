import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/index.js';

describe('@fudic/formatter', () => {
  it('exposes its version', () => {
    expect(VERSION).toBe('0.0.1');
  });
});
