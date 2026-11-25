import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappSearch from './myapp-search.fud';

test('renders', async () => {
  const t = await mount(MyappSearch);
  expect(t.host).toBeInTheDocument();
});
