import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/testing/history', async () => {
  const page = await visit('/docs/testing/history');
  expect(page.status).toBe(200);
});
