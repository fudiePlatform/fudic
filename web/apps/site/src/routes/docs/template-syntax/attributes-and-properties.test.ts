import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/template-syntax/attributes-and-properties', async () => {
  const page = await visit('/docs/template-syntax/attributes-and-properties');
  expect(page.status).toBe(200);
});
