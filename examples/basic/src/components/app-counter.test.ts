import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as AppCounter from './app-counter.fud';

// An interactive component (N3): it arrives as HTML and wakes up on the first gesture.

test('the first click wakes it up, and counts', async () => {
  const t = await mount(AppCounter, { props: { start: 2 } });
  expect(t.query('output')).toHaveTextContent('2');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('3');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('4');
});

test('a new start, from the parent, repaints', async () => {
  const t = await mount(AppCounter, { via: 'client', props: { start: 5 } });
  expect(t.query('output')).toHaveTextContent('5');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('6');
});
