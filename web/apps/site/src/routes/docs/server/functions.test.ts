import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server/functions', async () => {
  const page = await visit('/docs/server/functions');
  expect(page.status).toBe(200);
});
