import { test } from 'vitest';
import { assertLater, throwLater } from './later.js';

// What fails outside every test file: the report has no line of the test to give.
test('an assertion of a helper', async () => {
  await assertLater();
});

test('a throw of a helper', async () => {
  await throwLater();
});
