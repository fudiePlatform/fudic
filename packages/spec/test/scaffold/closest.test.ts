import { describe, expect, it } from 'vitest';
import { closest } from '../../src/index.js';

describe('closest (criterion 5)', () => {
  it('offers the term a typo was meant to be', () => {
    expect(closest('minheigt', ['visible', 'min-height', 'text'])).toBe('min-height');
  });

  it('offers nothing when no candidate is close', () => {
    expect(closest('xyz', ['min-height'])).toBeUndefined();
    expect(closest('anything', [])).toBeUndefined();
  });

  it('resolves a tie alphabetically, whatever the order given', () => {
    expect(closest('cat', ['cot', 'cbt'])).toBe('cbt');
  });

  it('prefers a closer candidate over an earlier one in alphabetical order', () => {
    expect(closest('text-hidden', ['aext-hidxen', 'text-hiden'])).toBe('text-hiden');
  });

  it('returns an exact match', () => {
    expect(closest('visible', ['visibles', 'visible'])).toBe('visible');
  });

  it('never accepts more than a third of the name', () => {
    // One edit, but a third of a two-letter name is less than one.
    expect(closest('ab', ['abc'])).toBeUndefined();
    // Two edits are a third of six letters, and more than a third of five.
    expect(closest('abcdef', ['abcdxy'])).toBe('abcdxy');
    expect(closest('abcde', ['abcxy'])).toBeUndefined();
  });

  it('never accepts more than two edits, however long the name', () => {
    expect(closest('a-very-long-term-name', ['a-very-long-term-nxyz'])).toBeUndefined();
  });
});
