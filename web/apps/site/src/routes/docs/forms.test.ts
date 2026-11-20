import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/forms', async () => {
  const page = await visit('/docs/forms');
  expect(page.status).toBe(200);
});
