import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/styles/shared', async () => {
  const page = await visit('/docs/styles/shared');
  expect(page.status).toBe(200);
});
