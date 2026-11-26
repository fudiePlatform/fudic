import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /about', async () => {
  const page = await visit('/about');
  expect(page.status).toBe(200);
});

test('has its title, its heading and the layout around it', async () => {
  const page = await visit('/about');
  expect(page.document.title).toBe('About us');
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('About us');
  expect(page.getByRole('link', { name: 'Home' })).toBeInTheDocument();
});

test('shouts its notice', async () => {
  const page = await visit('/about');
  expect(page.query('.notice')).toHaveTextContent('NEW BOOKS EVERY WEEK');
});
