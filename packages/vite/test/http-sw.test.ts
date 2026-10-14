/**
 * SDD-56 §4.9 in the generated Service Worker: it answers the invalidation a server function's
 * stub posts, forgets a concrete path with `invalidate` and a route pattern with
 * `invalidatePattern`, and confirms on the port it was handed — also with no router, or the
 * page would wait for ever.
 */

import { describe, expect, it } from 'vitest';
import { emitSwBootstrap } from '../src/bootstrap.js';

const code = emitSwBootstrap({
  manifestUrlExpr: '"/fudic-routes.json"',
  shell: [],
  resources: [],
  app: 'shop',
  runtimePrefix: '/_fudic/',
  runtimeCache: 'fudic-runtime-0.0.1',
  runtimeCachePrefix: 'fudic-runtime-',
  runtimeMarker: '/_fudic/marker/shop',
  renderer: '/_fudic/0.0.1/ssr/index.js',
});

const handler = code.slice(code.indexOf('msg.type === INVALIDATE_MESSAGE'), code.indexOf("self.addEventListener('fetch'"));

describe('the worker answers INVALIDATE_MESSAGE', () => {
  it('imports the message from @fudic/transport', () => {
    expect(code).toMatch(/import \{[^}]*INVALIDATE_MESSAGE[^}]*\} from '@fudic\/transport';/u);
  });

  it('a pattern goes to invalidatePattern, a concrete path to invalidate, in order', () => {
    expect(handler).toContain('for (const path of msg.paths) {');
    expect(handler).toContain("await (path.includes('/:') ? r.invalidatePattern(path) : r.invalidate(path));");
  });

  it('keeps the worker alive until it has answered', () => {
    expect(handler).toContain('e.waitUntil(boot().then(async (r) => {');
  });
});

/**
 * The callback the worker hands `boot().then(…)`, taken out of the generated text and run:
 * with a router, without one, and with one whose cache fails.
 */
describe('the worker confirms, whatever happens', () => {
  const start = handler.indexOf('async (r) => {');
  const body = handler.slice(start, handler.indexOf('}));', start) + 1);

  type Router = { invalidate(p: string): Promise<void>; invalidatePattern(p: string): Promise<void> };

  function answer(paths: string[], router: Router | null) {
    const confirmed: unknown[] = [];
    const e = { ports: [{ postMessage: (v: unknown) => confirmed.push(v) }] };
    const callback = new Function('e', 'msg', `return ${body};`)(e, { paths }) as (r: Router | null) => Promise<void>;
    return { done: callback(router), confirmed };
  }

  const recorder = () => {
    const calls: string[] = [];
    const router: Router = {
      invalidate: async (p) => void calls.push(`invalidate ${p}`),
      invalidatePattern: async (p) => void calls.push(`pattern ${p}`),
    };
    return { calls, router };
  };

  it('forgets each path in order, then confirms', async () => {
    const { calls, router } = recorder();
    const { done, confirmed } = answer(['/usuarios', '/blog/:slug', '/blog'], router);
    await done;
    expect(calls).toEqual(['invalidate /usuarios', 'pattern /blog/:slug', 'invalidate /blog']);
    expect(confirmed).toEqual([true]);
  });

  it('confirms with no router at all', async () => {
    const { done, confirmed } = answer(['/usuarios'], null);
    await done;
    expect(confirmed).toEqual([true]);
  });

  it('confirms when the cache fails, so the call never hangs', async () => {
    const router: Router = {
      invalidate: async () => {
        throw new Error('quota');
      },
      invalidatePattern: async () => {},
    };
    const { done, confirmed } = answer(['/usuarios'], router);
    await expect(done).rejects.toThrow('quota');
    expect(confirmed).toEqual([true]);
  });

  it('a message without a port is not an error', async () => {
    const e = { ports: [] };
    const callback = new Function('e', 'msg', `return ${body};`)(e, { paths: [] }) as (r: null) => Promise<void>;
    await expect(callback(null)).resolves.toBeUndefined();
  });
});
