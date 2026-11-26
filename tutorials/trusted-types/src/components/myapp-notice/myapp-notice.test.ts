import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappNotice from './myapp-notice.fud';

test('renders', async () => {
  const t = await mount(MyappNotice);
  expect(t.host).toBeInTheDocument();
});
