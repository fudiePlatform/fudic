import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as TiendaCard from './tienda-card.fud';

test('renders', async () => {
  const t = await mount(TiendaCard);
  expect(t.host).toBeInTheDocument();
});
