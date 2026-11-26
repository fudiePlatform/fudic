import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /isomorphic, opening with its level and its objectives', async () => {
  const page = await visit('/isomorphic');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Render isomórfico: el mismo HTML en tres sitios');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/isomorphic');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/isomorphic');
});
