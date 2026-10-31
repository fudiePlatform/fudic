import { expect, test } from 'vitest';
import iniciales from './iniciales';

test('iniciales gives the upper-case initials of a name', () => {
  expect(iniciales.format('ada lovelace', 'en')).toBe('AL');
  expect(iniciales.format('  grace   brewster hopper ', 'en')).toBe('GBH');
  expect(iniciales.format('', 'en')).toBe('');
});

test('it upper-cases in the locale it is given', () => {
  // The dotted i of Turkish: the app that paints decides, not the library.
  expect(iniciales.format('ilkay', 'tr')).toBe('İ');
  expect(iniciales.format('ilkay', 'en')).toBe('I');
});

test('it is a project pipe: kind pipe, its name, no options', () => {
  expect(iniciales).toMatchObject({ kind: 'pipe', name: 'iniciales', options: {} });
});
