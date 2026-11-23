import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference', async () => {
  const page = await visit('/docs/reference');
  expect(page.status).toBe(200);
});
