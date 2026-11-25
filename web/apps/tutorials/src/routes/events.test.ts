import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /events, opening with its level and its objectives', async () => {
  const page = await visit('/events');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Responder a un clic');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/events');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/events');
});
