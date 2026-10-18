import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /catalogo', async () => {
  const page = await visit('/catalogo');
  expect(page.status).toBe(200);
});
