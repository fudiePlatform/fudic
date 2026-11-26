import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /localized-urls, opening with its level and its objectives', async () => {
  const page = await visit('/localized-urls');
  expect(page.status).toBe(200);
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('URLs con idioma y un selector');
  expect(page.getByRole('heading', { name: 'Objetivos' })).toBeInTheDocument();
});

test('the menu marks it as the current tutorial', async () => {
  const page = await visit('/localized-urls');
  expect(page.getByRole('link', { current: 'page' })).toHaveAttribute('href', '/tutorials/localized-urls');
});
