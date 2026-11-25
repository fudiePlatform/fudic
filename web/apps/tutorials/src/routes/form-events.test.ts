import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /form-events, opening with its level and its objectives', async () => {
  const page = await visit('/form-events');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Eventos del formulario');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/form-events');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/form-events');
});
