import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/forms/submitting', async () => {
  const page = await visit('/docs/forms/submitting');
  expect(page.status).toBe(200);
});
