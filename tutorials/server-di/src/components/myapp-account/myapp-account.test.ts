import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappAccount from './myapp-account.fud';

test('renders', async () => {
  const t = await mount(MyappAccount);
  expect(t.host).toBeInTheDocument();
});
