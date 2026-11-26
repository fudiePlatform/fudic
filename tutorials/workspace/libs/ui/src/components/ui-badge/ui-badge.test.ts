import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiBadge from './ui-badge.fud';

test('renders', async () => {
  const t = await mount(UiBadge);
  expect(t.host).toBeInTheDocument();
});
