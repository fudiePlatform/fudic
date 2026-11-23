import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/terms', async () => {
  const page = await visit('/docs/terms');
  expect(page.status).toBe(200);
});
