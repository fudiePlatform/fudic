import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server/pipes', async () => {
  const page = await visit('/docs/server/pipes');
  expect(page.status).toBe(200);
});
