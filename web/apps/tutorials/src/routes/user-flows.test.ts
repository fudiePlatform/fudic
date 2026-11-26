import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /user-flows, opening with its level and its objectives', async () => {
  const page = await visit('/user-flows');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Un flujo entre páginas');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/user-flows');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/user-flows');
});
