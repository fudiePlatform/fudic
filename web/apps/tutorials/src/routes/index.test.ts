import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers / with a card per category', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Aprende Fudic haciéndolo.');
  expect(page.query('.categories')?.querySelectorAll(':scope > .category')).toHaveLength(16);
});

test('a category with a written tutorial links to it', async () => {
  const page = await visit('/');
  expect(page.getByRole('link', { name: 'Primeros pasos' })).toHaveAttribute('href', '/tutorials/first-app');
});
