import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiNav from './ui-nav.fud';

test('renders', async () => {
  const t = await mount(UiNav);
  expect(t.host).toBeInTheDocument();
});
