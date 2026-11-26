import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /pipes, opening with its level and its objectives', async () => {
  const page = await visit('/pipes');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Los pipes de Fudic, y uno propio');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/pipes');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/pipes');
});
