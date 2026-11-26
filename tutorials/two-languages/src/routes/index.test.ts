import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /en/ in English', async () => {
  const page = await visit('/en/');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to the shop');
});

test('answers /es/ in Spanish', async () => {
  const page = await visit('/es/');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Te damos la bienvenida a la tienda');
});
