import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/forms/form-associated', async () => {
  const page = await visit('/docs/forms/form-associated');
  expect(page.status).toBe(200);
});
