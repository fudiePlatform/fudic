import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /plurals-and-formats, opening with its level and its objectives', async () => {
  const page = await visit('/plurals-and-formats');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Plurales, moneda y t()');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/plurals-and-formats');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/plurals-and-formats');
});
