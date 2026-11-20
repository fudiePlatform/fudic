import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server/types', async () => {
  const page = await visit('/docs/server/types');
  expect(page.status).toBe(200);
});
