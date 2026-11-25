import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /custom-rules, opening with its level and its objectives', async () => {
  const page = await visit('/custom-rules');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Reglas y patrones propios');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/custom-rules');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/custom-rules');
});
