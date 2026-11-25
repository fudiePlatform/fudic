import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappSizes from './myapp-sizes.fud';

test('renders', async () => {
  const t = await mount(MyappSizes);
  expect(t.host).toBeInTheDocument();
});
