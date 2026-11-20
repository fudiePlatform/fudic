import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/routing', async () => {
  const page = await visit('/docs/routing');
  expect(page.status).toBe(200);
});
