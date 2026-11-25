import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /editor, opening with its level and its objectives', async () => {
  const page = await visit('/editor');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('El editor a tu favor');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/editor');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/editor');
});
