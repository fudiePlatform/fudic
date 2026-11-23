import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/reference/forms', async () => {
  const page = await visit('/docs/reference/forms');
  expect(page.status).toBe(200);
});
