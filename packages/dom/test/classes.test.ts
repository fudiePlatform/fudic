/**
 * The class list token by token: one pure function every adapter applies, so a dynamic class
 * only moves its own tokens on the server and in the browser alike.
 */

import { describe, expect, it } from 'vitest';
import { classDiff, classTokens } from '../src/classes.js';
import * as api from '../src/index.js';

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

  it('is exported from the package entry', () => {
    expect(api.classDiff).toBe(classDiff);
    expect(api.classTokens).toBe(classTokens);
  });
});
