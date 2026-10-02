import { describe, expect, it } from 'vitest';
import { SPEC_EXTENSION } from '../src/index.js';

describe('@fudic/spec', () => {
  it('names the criteria file extension', () => {
    expect(SPEC_EXTENSION).toBe('.fudspec');
  });
});
