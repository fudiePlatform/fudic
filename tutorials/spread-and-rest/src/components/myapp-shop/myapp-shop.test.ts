import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappShop from './myapp-shop.fud';

test('renders', async () => {
  const t = await mount(MyappShop);
  expect(t.host).toBeInTheDocument();
});
