/**
 * SDD-68 §3.4 — what the browser module of a route exposes for its `load`: a request to the
 * server for the `data`, at the address of the data endpoint, never `load` itself.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DATA_PREFIX } from '@fudic/conventions';
import { page, type BrowserLoadPiece } from '../../src/contract/index.js';
import { FRAMES_TYPE, readFrames, writeFrames } from '../../src/wire/frames.js';

const TYPES = { fields: { users: { list: 'str' as const } } };

/** What the data endpoint answers: its frames. */
const framed = (data: Record<string, unknown>, layout?: unknown): Response =>
  new Response(writeFrames(TYPES, data, layout), { headers: { 'content-type': FRAMES_TYPE } });

afterEach(() => vi.unstubAllGlobals());

/** A `fetch` that answers `response` and records what it was asked. */
function endpoint(response: Response): { asked: { url: string; init: RequestInit }[] } {
  const asked: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/usuarios' });
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    asked.push({ url: url.href, init });
    return response;
  });
  return { asked };
}

const browserLoad = () =>
  page({ id: 'routes/usuarios', name: 'load', browser: true, ...TYPES, read: readFrames }) as unknown as BrowserLoadPiece<{ users: string[] }>;

describe('load.fetch (§3.4)', () => {
  it('GETs DATA_PREFIX + path, uncached and same-origin, and resolves with the data of its first frame', async () => {
    const { asked } = endpoint(framed({ users: ['ana'] }, { title: 'x' }));
    expect(await browserLoad().fetch('/usuarios')).toEqual({ users: ['ana'] });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.url).toBe(`https://app.test${DATA_PREFIX}/usuarios`);
    expect(asked[0]!.init).toEqual({ credentials: 'same-origin', cache: 'no-store', headers: { accept: FRAMES_TYPE } });
  });

  it('hands the signal over when it is given one', async () => {
    const { asked } = endpoint(framed({ users: [] }));
    const controller = new AbortController();
    await browserLoad().fetch('/usuarios', controller.signal);
    expect(asked[0]!.init.signal).toBe(controller.signal);
  });

  it('a non-2xx answer rejects with its status', async () => {
    endpoint(new Response('boom', { status: 500 }));
    await expect(browserLoad().fetch('/usuarios')).rejects.toThrow('fudic: the data of /usuarios answered 500');
  });

  it('both variants of load ask; paths and layout do not', () => {
    // The server variant too: under @fudic/testing one module graph serves both sides, and the
    // route's chunk imports whichever `load` that graph holds.
    expect('fetch' in page({ id: 'routes/usuarios', name: 'load' })).toBe(true);
    expect('fetch' in page({ id: 'routes/usuarios', name: 'layout', browser: true })).toBe(false);
    expect('fetch' in page({ id: 'routes/usuarios', name: 'paths' })).toBe(false);
  });
});
