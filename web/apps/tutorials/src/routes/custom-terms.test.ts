import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /custom-terms, opening with its level and its objectives', async () => {
  const page = await visit('/custom-terms');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Tu primer paso propio en un .fudspec');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/custom-terms');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/custom-terms');
});
