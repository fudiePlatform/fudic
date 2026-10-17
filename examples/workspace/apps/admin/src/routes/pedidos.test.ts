import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /pedidos', async () => {
  const page = await visit('/pedidos');
  expect(page.status).toBe(200);
});
