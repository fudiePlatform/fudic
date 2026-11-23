import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/terms/sharing', async () => {
  const page = await visit('/docs/terms/sharing');
  expect(page.status).toBe(200);
});
