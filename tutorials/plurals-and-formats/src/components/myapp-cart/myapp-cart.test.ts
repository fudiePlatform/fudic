import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappCart from './myapp-cart.fud';

test('renders', async () => {
  const t = await mount(MyappCart);
  expect(t.host).toBeInTheDocument();
});
