import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/configuration', async () => {
  const page = await visit('/docs/configuration');
  expect(page.status).toBe(200);
});
