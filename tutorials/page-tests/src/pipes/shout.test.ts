import { expect, test } from 'vitest';
import shout from './shout';

test('shout writes the value in upper case', () => {
  expect(shout.format('new books', 'en')).toBe('NEW BOOKS');
});

test('shout follows the rules of each language', () => {
  expect(shout.format('istanbul', 'tr')).toBe('İSTANBUL');
});
