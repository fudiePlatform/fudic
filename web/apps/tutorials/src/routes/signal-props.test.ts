import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /signal-props, opening with its level and its objectives', async () => {
  const page = await visit('/signal-props');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Valor o signal en una prop');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/signal-props');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/signal-props');
});
