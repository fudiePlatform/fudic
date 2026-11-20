import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/server/rules', async () => {
  const page = await visit('/docs/server/rules');
  expect(page.status).toBe(200);
});
