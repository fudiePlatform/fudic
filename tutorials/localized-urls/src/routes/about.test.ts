import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('the menu of /es/about links to the Spanish pages', async () => {
  const page = await visit('/es/about');
  expect(page.getByRole('link', { name: 'Quiénes somos' })).toHaveAttribute('href', '/es/about');
});
