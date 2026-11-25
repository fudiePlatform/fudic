import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /route-signals, opening with its level and its objectives', async () => {
  const page = await visit('/route-signals');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Un signal en la página');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/route-signals');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/route-signals');
});
