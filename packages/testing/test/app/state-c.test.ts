/** BUG-51 — see `state-a.test.ts`. */

import { expect, test } from 'vitest';
import { bump } from './state/counter.js';

test('the counter starts from nothing in this file', () => {
  expect(bump()).toBe(1);
});
