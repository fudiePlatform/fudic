import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /early-hints, opening with its level and its objectives', async () => {
  const page = await visit('/early-hints');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Early hints');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/early-hints');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/early-hints');
});
