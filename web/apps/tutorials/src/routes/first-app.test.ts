import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /first-app, opening with its level and its objectives', async () => {
  const page = await visit('/first-app');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Tu primera app');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/first-app');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/first-app');
});
