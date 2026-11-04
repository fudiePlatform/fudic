import { describe, expect, test } from 'vitest';
import { mount } from '../../../src/index.js';
import * as XCounter from '../src/x-counter.fud';

// Four green and two red, on purpose: what `runTests` must count and list.
describe('x-counter', () => {
  test('starts at zero', async () => {
    const t = await mount(XCounter);
    expect(t.getByRole('status')).toHaveTextContent('0');
  });

  test('starts where it is told', async () => {
    const t = await mount(XCounter, { props: { start: 4 } });
    expect(t.getByRole('status')).toHaveTextContent('4');
  });

  test('adds one on click', async () => {
    const t = await mount(XCounter);
    await t.click(t.getByRole('button', { name: '+' }));
    expect(t.getByRole('status')).toHaveTextContent('1');
  });

  test('has one button', async () => {
    const t = await mount(XCounter);
    expect(t.root.querySelectorAll('button')).toHaveLength(1);
  });

  test('a press counts nothing', () => {
    const pressed = 1;
    expect(pressed).toBe(0);
  });

  test('the button is disabled', async () => {
    const t = await mount(XCounter);
    expect(t.getByRole('button', { name: '+' })).toBeDisabled();
  });
});
