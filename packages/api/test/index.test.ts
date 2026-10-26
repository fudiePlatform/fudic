import { describe, expect, it } from 'vitest';
import { API_EXTENSION } from '../src/index.js';

describe('the package entry', () => {
  it('names the contract file extension', () => {
    expect(API_EXTENSION).toBe('.fudapi');
  });
});
