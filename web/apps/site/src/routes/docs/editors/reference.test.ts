import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/editors/reference', async () => {
  const page = await visit('/docs/editors/reference');
  expect(page.status).toBe(200);
});
