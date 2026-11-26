import { expect, test, vi } from 'vitest';
import { visit } from '@fudic/testing';
import { allBooks } from '../server/books';

vi.mock('../server/books', async (importOriginal) => {
  const real = await importOriginal<typeof import('../server/books')>();
  return { allBooks: vi.fn(real.allBooks) };
});

test('answers /books', async () => {
  const page = await visit('/books');
  expect(page.status).toBe(200);
});

test('lists every book that load returns', async () => {
  const page = await visit('/books');
  expect(page.document.querySelectorAll('li')).toHaveLength(3);
  expect(page.getByText('Dune')).toBeInTheDocument();
});

test('says so when there are no books', async () => {
  vi.mocked(allBooks).mockResolvedValueOnce([]);
  const page = await visit('/books');
  expect(page.getByText('No books yet.')).toBeInTheDocument();
});

test('shows the error page when the books cannot be read', async () => {
  vi.mocked(allBooks).mockRejectedValueOnce(new Error('the database is down'));
  const page = await visit('/books');
  expect(page.status).toBe(500);
});

test('paints the data it is given, without running load', async () => {
  vi.mocked(allBooks).mockClear();
  const page = await visit('/books', { data: { books: [{ id: 9, title: 'Ulysses' }] } });
  expect(page.getByText('Ulysses')).toBeInTheDocument();
  expect(allBooks).not.toHaveBeenCalled();
});
