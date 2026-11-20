import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/routing/data', async () => {
  const page = await visit('/docs/routing/data');
  expect(page.status).toBe(200);
});
