import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /form-tests, opening with its level and its objectives', async () => {
  const page = await visit('/form-tests');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Probar un formulario y sus reglas');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/form-tests');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/form-tests');
});
