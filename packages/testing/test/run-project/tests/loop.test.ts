import { expect, test } from 'vitest';
import { mount } from '../../../src/index.js';
// A `.fud` with a loop without `key (…)`: it does not compile, so this file does not load.
import * as XLoop from '../src/x-loop.fud';

test('lists its items', async () => {
  const t = await mount(XLoop, { props: { items: ['a'] } });
  expect(t.root.querySelectorAll('li')).toHaveLength(1);
});
