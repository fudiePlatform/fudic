import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/styles/guide', async () => {
  const page = await visit('/docs/styles/guide');
  expect(page.status).toBe(200);
});
