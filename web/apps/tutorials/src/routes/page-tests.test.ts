import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /page-tests, opening with its level and its objectives', async () => {
  const page = await visit('/page-tests');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Probar una página, su layout y un pipe');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/page-tests');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/page-tests');
});
