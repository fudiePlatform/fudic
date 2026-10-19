/**
 * BUG-51 — files share a worker, never the state of the app's modules. Four files bump the same
 * counter once each; without the reset of the setup, the ones that land on a worker after
 * another would see it already moved.
 */

import { expect, test } from 'vitest';
import { bump } from './state/counter.js';

test('the counter starts from nothing in this file', () => {
  expect(bump()).toBe(1);
});
