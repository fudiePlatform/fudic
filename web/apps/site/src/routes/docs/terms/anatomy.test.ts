import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/terms/anatomy', async () => {
  const page = await visit('/docs/terms/anatomy');
  expect(page.status).toBe(200);
});
