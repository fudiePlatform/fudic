import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappWidth from './myapp-width.fud';

test('renders', async () => {
  const t = await mount(MyappWidth);
  expect(t.host).toBeInTheDocument();
});
