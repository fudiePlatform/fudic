import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappAlert from './myapp-alert.fud';

test('renders', async () => {
  const t = await mount(MyappAlert);
  expect(t.host).toBeInTheDocument();
});
