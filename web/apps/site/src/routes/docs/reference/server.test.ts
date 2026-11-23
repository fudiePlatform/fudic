import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/server', async () => {
  const page = await visit('/docs/reference/server');
  expect(page.status).toBe(200);
});
