import { expect, test } from 'vitest';
import { mount } from '../../../src/index.js';
import * as XCounter from '../src/x-counter.fud';

// A test that never gets to check: `mount` throws, a prop that is not JSON on the server path.
test('mounts with a function as its start', async () => {
  const t = await mount(XCounter, { props: { start: () => 1 } });
  expect(t.getByRole('status')).toHaveTextContent('1');
});
