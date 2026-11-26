import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappCounter from './myapp-counter.fud';

test('starts at 0', async () => {
  const t = await mount(MyappCounter);
  expect(t.getByRole('status')).toHaveTextContent('0');
});

test('adds one on each click', async () => {
  const t = await mount(MyappCounter, { props: { start: 2 } });
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.getByRole('status')).toHaveTextContent('3');
});
