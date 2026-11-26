import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /page-maps, opening with its level and its objectives', async () => {
  const page = await visit('/page-maps');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Lo que la página le cuenta al runtime');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/page-maps');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/page-maps');
});
