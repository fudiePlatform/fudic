import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/core', async () => {
  const page = await visit('/docs/reference/core');
  expect(page.status).toBe(200);
});
