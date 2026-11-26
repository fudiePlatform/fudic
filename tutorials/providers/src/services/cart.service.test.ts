import { expect, test } from 'vitest';
import { Cart } from './cart.service';

test('creates a Cart', () => {
  expect(new Cart()).toBeInstanceOf(Cart);
});
