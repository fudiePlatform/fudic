import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/security', async () => {
  const page = await visit('/docs/security');
  expect(page.status).toBe(200);
});
