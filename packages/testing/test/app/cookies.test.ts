import { expect, test } from 'vitest';
import { mount } from '../../src/index.js';
import * as XVisits from './src/components/x-visits.fud';

test('the cookies a function sets travel back on the next call, as in a browser', async () => {
  const t = await mount(XVisits);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('1');
  expect(document.cookie).toBe('visits=1');
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('2');
});

test('the next test starts with an empty jar', async () => {
  expect(document.cookie).toBe('');
  const t = await mount(XVisits);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('1');
});
