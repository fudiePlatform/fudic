import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /workspace, opening with its level and its objectives', async () => {
  const page = await visit('/workspace');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Dos apps y una librería');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/workspace');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/workspace');
});
