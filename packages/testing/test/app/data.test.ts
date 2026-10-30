import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readFrames } from '@fudic/http/wire/frames';
import { visit } from '../../src/index.js';

/** The types of `load` of `routes/blog/[slug].fudapi`, which its frames are written with (SDD-70 §3.7). */
const BLOG = { fields: { title: 'str', lang: 'str' } } as const;

/** The first frame of an answer, as `{ data, layout }`. */
const framed = (response: Response): Promise<unknown> => readFrames(BLOG, response.body!);

// The data endpoint of the in-memory server (SDD-68 §4.8): what a page asks after a call
// invalidated it. `load` reads the same mocked data edge `visit` does.
const findPost = vi.hoisted(() => vi.fn());
vi.mock('./src/data/posts', () => ({ findPost }));

beforeEach(() => {
  findPost.mockReset();
  findPost.mockImplementation(async (slug: string) =>
    slug === 'nope' ? undefined : { title: `Post ${slug}`, lang: 'en' },
  );
});

describe('GET /_fudic/data/<route>', () => {
  test("runs the route's load with its params, and answers { data, layout } in its frames", async () => {
    const response = await fetch('/_fudic/data/blog/x');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/fud+frames');
    expect(await framed(response)).toEqual({ data: { title: 'Post x', lang: 'en' }, layout: { culture: 'en' } });
    expect(findPost).toHaveBeenCalledExactlyOnceWith('x');
  });

  test('asks load again on every request: the endpoint has no cache of its own', async () => {
    await fetch('/_fudic/data/blog/x');
    findPost.mockImplementation(async (slug: string) => ({ title: `New ${slug}`, lang: 'fr' }));
    expect(await framed(await fetch('/_fudic/data/blog/x'))).toMatchObject({ data: { title: 'New x' } });
  });

  test('a load that throws answers the problem of its status', async () => {
    const response = await fetch('/_fudic/data/blog/nope');
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 404, detail: 'no post "nope"' });
  });

  test('a load that redirects answers its status and where it goes', async () => {
    const response = await fetch('/_fudic/data/moved');
    expect(response.status).toBe(302);
    expect(await response.json()).toEqual({ status: 302, title: 'Redirect', location: '/blog/x' });
  });

  test('a path no route matches is a 404 with no body', async () => {
    const response = await fetch('/_fudic/data/no/such/route');
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });

  test('a page that was visited asks it the same way', async () => {
    const page = await visit('/blog/x');
    expect(page.status).toBe(200);
    expect(await framed(await fetch('/_fudic/data/blog/x'))).toMatchObject({ data: { title: 'Post x' } });
  });

  test('another origin is still not answered', async () => {
    await expect(fetch('https://elsewhere.test/_fudic/data/blog/x')).rejects.toThrow('a test has no network');
  });
});
