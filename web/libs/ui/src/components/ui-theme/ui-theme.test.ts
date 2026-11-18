import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiTheme from './ui-theme.fud';

test('renders', async () => {
  const t = await mount(UiTheme);
  expect(t.host).toBeInTheDocument();
});
