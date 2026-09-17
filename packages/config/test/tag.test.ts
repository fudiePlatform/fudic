import { describe, expect, it } from 'vitest';
import { tagOf } from '../src/index.js';

describe('tagOf (criterion 5)', () => {
  it('joins a bare name to the prefix, and is the only place the hyphen is put', () => {
    expect(tagOf('app', 'card')).toBe('app-card');
  });

  it('returns a name that already carries a hyphen untouched — it is already a tag', () => {
    expect(tagOf('app', 'signal-counter')).toBe('signal-counter');
  });

  it('returns everything untouched when there is no prefix', () => {
    expect(tagOf('', 'card')).toBe('card');
  });

  it('never produces a double hyphen, whatever it is handed', () => {
    expect(tagOf('', 'signal-counter')).toBe('signal-counter');
  });
});
