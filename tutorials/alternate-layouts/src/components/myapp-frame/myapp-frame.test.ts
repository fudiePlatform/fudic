import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappFrame from './myapp-frame.fud';

test('renders', async () => {
  const t = await mount(MyappFrame);
  expect(t.host).toBeInTheDocument();
});
