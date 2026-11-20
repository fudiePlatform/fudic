import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server/middlewares', async () => {
  const page = await visit('/docs/server/middlewares');
  expect(page.status).toBe(200);
});
