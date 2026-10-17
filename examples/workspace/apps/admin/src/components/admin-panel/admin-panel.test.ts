import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as AdminPanel from './admin-panel.fud';

test('renders', async () => {
  const t = await mount(AdminPanel);
  expect(t.host).toBeInTheDocument();
});
