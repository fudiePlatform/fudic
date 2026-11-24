import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /connect', async () => {
  const page = await visit('/connect');
  expect(page.status).toBe(200);
});
