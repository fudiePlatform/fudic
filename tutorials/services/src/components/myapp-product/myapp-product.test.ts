import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappProduct from './myapp-product.fud';

test('renders', async () => {
  const t = await mount(MyappProduct);
  expect(t.host).toBeInTheDocument();
});
