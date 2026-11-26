import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappBadge from './myapp-badge.fud';

test('renders', async () => {
  const t = await mount(MyappBadge);
  expect(t.host).toBeInTheDocument();
});
