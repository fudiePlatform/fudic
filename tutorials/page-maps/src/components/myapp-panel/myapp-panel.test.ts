import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappPanel from './myapp-panel.fud';

test('renders', async () => {
  const t = await mount(MyappPanel);
  expect(t.host).toBeInTheDocument();
});
