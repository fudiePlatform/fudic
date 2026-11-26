import { expect, test } from 'vitest';
import { renderLayout } from '@fudic/testing';
import * as Layout from './_layout.fud';

test('renders the page inside it', async () => {
  const page = await renderLayout(Layout, { body: '<p>Hello</p>' });
  expect(page.document.querySelector('main')?.textContent).toContain('Hello');
});

test('links to every page', async () => {
  const page = await renderLayout(Layout, { body: '<p>Hello</p>' });
  expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  expect(page.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
});
