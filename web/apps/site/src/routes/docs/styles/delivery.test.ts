import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /docs/styles/delivery', async () => {
  const page = await visit('/docs/styles/delivery');
  expect(page.status).toBe(200);
});
