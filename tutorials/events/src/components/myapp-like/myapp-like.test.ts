import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappLike from './myapp-like.fud';

test('renders', async () => {
  const t = await mount(MyappLike);
  expect(t.host).toBeInTheDocument();
});
