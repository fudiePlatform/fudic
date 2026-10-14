import { beforeEach, expect, test, vi } from 'vitest';
import { visit } from '@fudic/testing';

// The data edge of the route, mocked: `load` reads it.
const findPost = vi.hoisted(() => vi.fn());
vi.mock('../../data/posts', () => ({ findPost, listSlugs: async () => [] }));

beforeEach(() => {
  findPost.mockReset();
  findPost.mockImplementation(async (slug: string) =>
    slug === 'x'
      ? { slug, title: 'Un artículo', summary: '', body: 'El cuerpo.', tag: 'plataforma', featured: false, lang: 'es' }
      : undefined,
  );
});

test('a slug that exists: load gets it, and the page paints its post', async () => {
  const page = await visit('/blog/x');
  expect(findPost).toHaveBeenCalledExactlyOnceWith('x');
  expect(page.status).toBe(200);
  expect(page.document.title).toBe('Un artículo — fudic');
  expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Un artículo');
  expect(page.getByText('El cuerpo.')).toBeInTheDocument();
  expect(page.document.documentElement.lang).toBe('es');
});

test('a slug that does not: the page says so', async () => {
  const page = await visit('/blog/nope');
  expect(page.document.title).toBe('Artículo no encontrado — fudic');
  expect(page.getByText('No hay ningún artículo con el slug "nope".')).toBeInTheDocument();
});

test('the lang comes out of the data, through layout()', async () => {
  const page = await visit('/blog/x', {
    data: { title: 'X', tag: 'a', body: '', found: true, lang: 'en' },
  });
  expect(findPost).not.toHaveBeenCalled();
  expect(page.document.documentElement.lang).toBe('en');
  expect(page.document.head.querySelector('meta[property="article:section"]')).toHaveAttribute('content', 'Blog');
});
