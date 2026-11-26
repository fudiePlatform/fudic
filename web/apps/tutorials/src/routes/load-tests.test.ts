import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /load-tests, opening with its level and its objectives', async () => {
  const page = await visit('/load-tests');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Probar el load de una página');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/load-tests');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/load-tests');
});
