import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappLater from './myapp-later.fud';

test('renders', async () => {
  const t = await mount(MyappLater);
  expect(t.host).toBeInTheDocument();
});
