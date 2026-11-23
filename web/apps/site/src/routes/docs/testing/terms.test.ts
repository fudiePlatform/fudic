import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/testing/terms', async () => {
  const page = await visit('/docs/testing/terms');
  expect(page.status).toBe(200);
});
