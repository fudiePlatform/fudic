import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappCard from './myapp-card.fud';

test('renders', async () => {
  const t = await mount(MyappCard);
  expect(t.host).toBeInTheDocument();
});
