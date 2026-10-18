import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiCard from './ui-card.fud';

test('renders', async () => {
  const t = await mount(UiCard);
  expect(t.host).toBeInTheDocument();
});
