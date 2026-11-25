import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /spread-and-rest, opening with its level and its objectives', async () => {
  const page = await visit('/spread-and-rest');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Spread y resto de props');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/spread-and-rest');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/spread-and-rest');
});
