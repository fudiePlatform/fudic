import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /attributes-and-classes, opening with its level and its objectives', async () => {
  const page = await visit('/attributes-and-classes');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Atributos, propiedades y clases');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/attributes-and-classes');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/attributes-and-classes');
});
