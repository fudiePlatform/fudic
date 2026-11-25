import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MyappField from './myapp-field.fud';

test('renders', async () => {
  const t = await mount(MyappField);
  expect(t.host).toBeInTheDocument();
});
