import { expect, test } from 'vitest';
import { mount } from '../../src/index.js';
import { NOW } from './src/services/now';
import * as XStamp from './src/components/x-stamp.fud';

const fake = [{ provide: NOW, use: () => 'a fixed clock' }];

test('providers reach the server: the page paints with them and a function resolves them', async () => {
  const t = await mount(XStamp, { providers: fake });
  expect(t.query('p')).toHaveTextContent('a fixed clock');
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('a fixed clock');
});

test('without them, the real service answers on both', async () => {
  const t = await mount(XStamp);
  expect(t.query('p')).toHaveTextContent('the real clock');
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('the real clock');
});
