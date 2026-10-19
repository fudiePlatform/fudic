/** BUG-51 — see `vitest.config.ts` beside it: a file that hydrates `x-hello`, then another. */

import { expect, test } from 'vitest';
import { mount } from '../../../src/index.js';
import * as XHello from '../src/components/x-hello.fud';

test('x-hello hydrates and calls its server function', async () => {
  const t = await mount(XHello);
  await t.click(t.getByRole('button'));
  expect(t.getByRole('status')).toHaveTextContent('Hello, Ana');
});
