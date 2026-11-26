import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /task, opening with its level and its objectives', async () => {
  const page = await visit('/task');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('El estado de una llamada con task');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/task');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/task');
});
