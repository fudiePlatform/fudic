import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server/running', async () => {
  const page = await visit('/docs/server/running');
  expect(page.status).toBe(200);
});
