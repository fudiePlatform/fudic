import { expect, test } from 'vitest';
import initials from './initials';

test('initials takes the first letter of each word, in upper case', () => {
  expect(initials.format('ada lovelace', 'en')).toBe('AL');
});
