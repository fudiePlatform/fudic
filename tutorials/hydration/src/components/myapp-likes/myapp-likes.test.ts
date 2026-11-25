import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappLikes from './myapp-likes.fud';

test('renders', async () => {
  const t = await mount(MyappLikes);
  expect(t.host).toBeInTheDocument();
});
