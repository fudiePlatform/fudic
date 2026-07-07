import { describe, expect, it, vi } from 'vitest';
import {
  type FetchEvent,
  type RenderMessage,
  type RenderRequest,
  type RouteManifest,
  createRouter,
} from '../src/index.js';

const manifest: RouteManifest = {
  match(route) {
    if (route.startsWith('/static')) {
      return { dynamic: false, chunk: '' };
    }
    if (route.startsWith('/view')) {
      return { dynamic: true, chunk: './view.js' };
    }
    return null;
  },
};

/** Worker double: replies over the transferred port with a degraded chunk+end. */
function workerDouble(html: string) {
  const posted: RenderRequest[] = [];
  const closures: Array<Promise<void>> = [];
  const worker = {
    postMessage(msg: unknown, transfer: Transferable[]): void {
      posted.push(msg as RenderRequest);
      const port = transfer[0] as MessagePort;
      closures.push(
        new Promise((resolve) => {
          port.addEventListener('close', () => resolve(), { once: true });
        }),
      );
      const bytes = new TextEncoder().encode(html);
      const buffer = bytes.slice().buffer;
      port.postMessage({ type: 'chunk', buffer } satisfies RenderMessage, [buffer]);
      port.postMessage({ type: 'end' } satisfies RenderMessage);
    },
  };
  return { worker: worker as unknown as Worker, posted, closures };
}

/** Cache double: url-keyed text store. */
function cacheDouble(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const cache = {
    async match(request: Request): Promise<Response | undefined> {
      const hit = store.get(request.url);
      return hit === undefined ? undefined : new Response(hit);
    },
    async put(request: Request, response: Response): Promise<void> {
      store.set(request.url, await response.text());
    },
  };
  return { cache: cache as unknown as Cache, store };
}

function navigationEvent(url: string, mode = 'navigate') {
  const responses: Array<Response | PromiseLike<Response>> = [];
  const event: FetchEvent = {
    request: { url, mode } as unknown as Request,
    respondWith(response) {
      responses.push(response);
    },
  };
  return { event, responses };
}

describe('createRouter (SDD-16 §6.10)', () => {
  it('miss: responds with the worker stream, caches the tee leg, closes the port', async () => {
    const { worker, posted, closures } = workerDouble('<h1>ww</h1>');
    const { cache, store } = cacheDouble();
    const router = createRouter({ manifest, worker, cache });
    const { event, responses } = navigationEvent('https://app.test/view?q=1');

    router.handle(event);
    expect(responses).toHaveLength(1);
    const response = await responses[0];
    expect(await response?.text()).toBe('<h1>ww</h1>');

    expect(posted).toHaveLength(1);
    expect(posted[0]?.type).toBe('render');
    expect(posted[0]?.route).toBe('/view?q=1');

    await vi.waitFor(() => {
      expect(store.get('https://app.test/view?q=1')).toBe('<h1>ww</h1>');
    });
    await closures[0]; // the per-request MessagePort is closed after the render
  });

  it('a failing cache.put still closes the port and keeps the response leg alive', async () => {
    const { worker, closures } = workerDouble('<h1>ww</h1>');
    const cache = {
      match: async (): Promise<Response | undefined> => undefined,
      put: async (): Promise<void> => {
        throw new Error('quota exceeded');
      },
    } as unknown as Cache;
    const router = createRouter({ manifest, worker, cache });
    const { event, responses } = navigationEvent('https://app.test/view');

    router.handle(event);
    const response = await responses[0];
    expect(await response?.text()).toBe('<h1>ww</h1>');
    await closures[0];
  });

  it('hit: responds from the cache without posting to the worker', async () => {
    const { worker, posted } = workerDouble('<h1>ww</h1>');
    const { cache } = cacheDouble({ 'https://app.test/view': '<h1>cached</h1>' });
    const router = createRouter({ manifest, worker, cache });
    const { event, responses } = navigationEvent('https://app.test/view');

    router.handle(event);
    const response = await responses[0];
    expect(await response?.text()).toBe('<h1>cached</h1>');
    expect(posted).toHaveLength(0);
  });

  it('non-navigation requests are left untouched', () => {
    const { worker, posted } = workerDouble('x');
    const { cache } = cacheDouble();
    const router = createRouter({ manifest, worker, cache });
    const { event, responses } = navigationEvent('https://app.test/view', 'cors');

    router.handle(event);
    expect(responses).toHaveLength(0);
    expect(posted).toHaveLength(0);
  });

  it('static and unknown routes stay outside the dynamic render shell', () => {
    const { worker, posted } = workerDouble('x');
    const { cache } = cacheDouble();
    const router = createRouter({ manifest, worker, cache });

    const staticNav = navigationEvent('https://app.test/static/logo');
    router.handle(staticNav.event);
    const unknownNav = navigationEvent('https://app.test/elsewhere');
    router.handle(unknownNav.event);

    expect(staticNav.responses).toHaveLength(0);
    expect(unknownNav.responses).toHaveLength(0);
    expect(posted).toHaveLength(0);
  });
});
