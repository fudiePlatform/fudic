import { beforeEach, describe, expect, test, vi } from 'vitest';
import { visit } from '../../src/index.js';

// The data edge of the route, mocked: `load` reads it through the same graph (§4.1).
const findPost = vi.hoisted(() => vi.fn());
vi.mock('./src/data/posts', () => ({ findPost }));

beforeEach(() => {
  findPost.mockReset();
  findPost.mockImplementation(async (slug: string) =>
    slug === 'nope' ? undefined : { title: `Post ${slug}`, lang: 'en' },
  );
});

describe('criterion 21: a route, through the routing of the plugin', () => {
  test('the params reach load, and its data is painted inside the layout', async () => {
    const page = await visit('/blog/x');
    expect(findPost).toHaveBeenCalledExactlyOnceWith('x');
    expect(page.status).toBe(200);
    expect(page.document.title).toBe('Post x — test');
    expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Post x');
    expect(page.query('nav a')).toHaveAttribute('href', '/');
    expect(page.document.documentElement.lang).toBe('en');
  });

  test('the page replaces the whole document', async () => {
    const page = await visit('/blog/y');
    expect(page.document).toBe(document);
    expect(document.querySelectorAll('main h1')).toHaveLength(1);
    expect(document.head.querySelector('meta[charset]')).not.toBeNull();
  });
});

describe('criterion 22: data in place of load', () => {
  test('load is not called, and layout(ctx, data) runs with that data', async () => {
    const page = await visit('/blog/x', { data: { title: 'Given', lang: 'fr' } });
    expect(findPost).not.toHaveBeenCalled();
    expect(page.status).toBe(200);
    expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('Given');
    expect(page.document.documentElement.lang).toBe('fr');
  });
});

describe('criterion 23: a load that throws notFound()', () => {
  test('paints _error.fud with status 404', async () => {
    const page = await visit('/blog/nope');
    expect(page.status).toBe(404);
    expect(page.document.title).toBe('Error 404');
    expect(page.getByRole('heading', { level: 1 })).toHaveTextContent('404');
    expect(page.getByText('no post "nope"')).toBeInTheDocument();
    // `_error.fud` uses the layout with nothing to say: the default of its prop.
    expect(page.document.documentElement.lang).toBe('es');
  });
});

describe('what a test cannot visit', () => {
  test('a load that redirects throws, naming the status and where it goes', async () => {
    await expect(visit('/moved')).rejects.toThrow("visit('/moved'): redirected with 302 to /blog/x");
  });

  test('a URL no route matches throws', async () => {
    await expect(visit('/nowhere?q=1')).rejects.toThrow("visit('/nowhere?q=1'): no route matches /nowhere");
  });
});

describe('criterion 27: one visit does not see the one before', () => {
  test('the first visits a page in English', async () => {
    await visit('/blog/x');
    expect(document.documentElement.lang).toBe('en');
  });

  test('the second finds an empty document', () => {
    expect(document.documentElement.hasAttribute('lang')).toBe(false);
    expect(document.title).toBe('');
    expect(document.body.childElementCount).toBe(0);
    expect(location.href).toBe('http://localhost/');
  });
});
