import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappConfirm from './myapp-confirm.fud';

test('renders', async () => {
  const t = await mount(MyappConfirm);
  expect(t.host).toBeInTheDocument();
});
