/**
 * The class list token by token: one pure function every adapter applies, so a dynamic class
 * only moves its own tokens on the server and in the browser alike.
 */

import { describe, expect, it } from 'vitest';
import { classDiff, classText, classTokens } from '../src/classes.js';
import * as api from '../src/index.js';

describe('classText', () => {
  it('a string, a number or a bigint is its text', () => {
    expect(classText('a b')).toBe('a b');
    expect(classText(1)).toBe('1');
    expect(classText(2n)).toBe('2');
  });

  it('anything else writes no token, as an attribute of a spread', () => {
    for (const value of [true, false, null, undefined, {}, () => 'a']) expect(classText(value)).toBe('');
  });
});

describe('classTokens', () => {
  it('splits on ASCII white space, in order, without empties or repeats', () => {
    expect(classTokens(' a\tb\n\nc\f a\rd ')).toEqual(['a', 'b', 'c', 'd']);
    expect(classTokens('')).toEqual([]);
  });

  it('does not split on a white space that is not ASCII', () => {
    expect(classTokens('a b')).toEqual(['a b']);
  });
});

describe('classDiff', () => {
  it('takes out the tokens the new text no longer has, and puts in all of the new', () => {
    expect(classDiff('b c', 'a b')).toEqual({ remove: ['a'], add: ['b', 'c'] });
  });

  it('the first time there is nothing to take out', () => {
    expect(classDiff('a', '')).toEqual({ remove: [], add: ['a'] });
  });

  it('reads each side by classText: the first time, `prev` may be undefined', () => {
    expect(classDiff('a', undefined)).toEqual({ remove: [], add: ['a'] });
    expect(classDiff(false, 'a b')).toEqual({ remove: ['a', 'b'], add: [] });
  });

  it('is exported from the package entry', () => {
    expect(api.classDiff).toBe(classDiff);
    expect(api.classTokens).toBe(classTokens);
    expect(api.classText).toBe(classText);
  });
});
