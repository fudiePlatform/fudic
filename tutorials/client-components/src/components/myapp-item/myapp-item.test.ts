import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappItem from './myapp-item.fud';

test('renders', async () => {
  const t = await mount(MyappItem);
  expect(t.host).toBeInTheDocument();
});
