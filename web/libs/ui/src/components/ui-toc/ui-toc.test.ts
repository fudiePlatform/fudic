import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiToc from './ui-toc.fud';

test('renders', async () => {
  const t = await mount(UiToc);
  expect(t.host).toBeInTheDocument();
});
