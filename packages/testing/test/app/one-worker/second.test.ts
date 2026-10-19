/** BUG-51 — the same component in the next file of the same worker: it must hydrate again. */

import { expect, test } from 'vitest';
import { mount } from '../../../src/index.js';
import * as XHello from '../src/components/x-hello.fud';

test('x-hello hydrates again, with the modules of this file', async () => {
  const t = await mount(XHello);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('Hello, Ana');
});
