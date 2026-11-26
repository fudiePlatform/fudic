import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import fixtures from './stock-status.fixture';
import * as StockStatus from './stock-status.fud';

test('in stock shows exactly "In stock", nothing else', async () => {
  const t = await mount(StockStatus, { props: fixtures.inStock });
  expect(t.root.textContent?.trim()).toBe('In stock');
});

test('out of stock shows exactly "Out of stock", nothing else', async () => {
  const t = await mount(StockStatus, { props: fixtures.outOfStock });
  expect(t.root.textContent?.trim()).toBe('Out of stock');
});
