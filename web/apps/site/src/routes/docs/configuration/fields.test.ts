import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/configuration/fields', async () => {
  const page = await visit('/docs/configuration/fields');
  expect(page.status).toBe(200);
});
