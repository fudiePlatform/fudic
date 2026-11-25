import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappNote from './myapp-note.fud';

test('renders', async () => {
  const t = await mount(MyappNote);
  expect(t.host).toBeInTheDocument();
});
