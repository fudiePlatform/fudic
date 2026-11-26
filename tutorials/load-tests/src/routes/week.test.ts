import { expect, test, vi } from 'vitest';
import { visit } from '@fudic/testing';
import { bestseller } from '../server/books';

vi.mock('../server/books', async (importOriginal) => {
  const real = await importOriginal<typeof import('../server/books')>();
  return { ...real, bestseller: vi.fn(async () => 'Dune') };
});

test('paints the best seller when it arrives', async () => {
  const page = await visit('/week');
  expect(page.getByText('Best seller of the week: Dune')).toBeInTheDocument();
});

test('says so when the best seller cannot be read', async () => {
  vi.mocked(bestseller).mockRejectedValueOnce(new Error('the service is down'));
  const page = await visit('/week');
  expect(page.status).toBe(200);
  expect(page.getByRole('alert')).toHaveTextContent('The best seller could not be loaded.');
});
