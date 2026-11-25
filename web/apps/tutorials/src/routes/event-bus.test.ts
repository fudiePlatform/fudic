import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /event-bus, opening with its level and its objectives', async () => {
  const page = await visit('/event-bus');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Un bus entre componentes');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/event-bus');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/event-bus');
});
