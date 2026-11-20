import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/forms/validation', async () => {
  const page = await visit('/docs/forms/validation');
  expect(page.status).toBe(200);
});
