import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappCounter from './myapp-counter.fud';

test('renders', async () => {
  const t = await mount(MyappCounter);
  expect(t.host).toBeInTheDocument();
});
