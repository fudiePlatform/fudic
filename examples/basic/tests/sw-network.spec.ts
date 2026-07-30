/**
 * The three loads, measured.
 *
 * Load 1 is cold: no Service Worker, the server answers everything and the SW registers.
 * From load 2 on, the SW controls the page — so from load 2 on, everything it precached
 * or warmed must come from it. The observed behaviour was that load 2 still went to the
 * network for `/fudic-main.js` and for a shared `/assets/*.js`, and only load 3 converged.
 *
 * The first test prints the full trace and asserts nothing: it is the instrument. The
 * rest assert the invariants, one per mechanism, so a failure names its own cause.
 */

import { test, expect } from '@playwright/test';
import {
  dumpCaches,
  fromNetwork,
  measure,
  record,
  render,
  renderCaches,
  servedBy,
  type Hit,
} from './traffic.js';

const MAIN = '/fudic-main.js';
const SW = '/fudic-sw.js';
const MANIFEST = '/fudic-routes.json';

/** Load 1 (cold) → load 2 (first refresh) → load 3 (second refresh). */
async function threeLoads(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
  const recorder = record(context);
  const first = await measure(recorder, page, () => page.goto('/'), {
    awaitControl: true,
    settleMs: 2000,
  });
  const second = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });
  const third = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });
  return { first, second, third };
}

test.describe('the first three loads of /', () => {
  test('trace: who answers what, load by load', async ({ page, context }) => {
    const { first, second, third } = await threeLoads(page, context);
    console.log(render('LOAD 1 — cold, no controller yet', first));
    console.log(render('LOAD 2 — first refresh, SW controlling', second));
    console.log(render('LOAD 3 — second refresh', third));

    // What went to the real network on each load, condensed — this is the list that
    // must shrink to "the navigation and the SW update check" by load 2.
    for (const [label, hits] of [
      ['LOAD 1', first],
      ['LOAD 2', second],
      ['LOAD 3', third],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      console.log(
        `\n${label} went to the network for: ${
          fromNetwork(hits)
            .map((h) => h.path)
            .join(', ') || '(nothing)'
        }`,
      );
    }
  });

  test('BUG-01 from load 2 on, the precached shell comes from the Service Worker', async ({
    page,
    context,
  }) => {
    const { second, third } = await threeLoads(page, context);
    for (const [label, hits] of [
      ['load 2', second],
      ['load 3', third],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      const main = servedBy(hits, MAIN);
      expect(main.length, `${label}: ${MAIN} was requested`).toBeGreaterThan(0);
      expect(
        main.every((h) => h.fromServiceWorker),
        `${label}: ${MAIN} must come from the SW, saw ${JSON.stringify(main)}`,
      ).toBe(true);
    }
  });

  test('BUG-03 no /assets file is both served by the SW and fetched from the network', async ({
    page,
    context,
  }) => {
    const { second, third } = await threeLoads(page, context);
    for (const [label, hits] of [
      ['load 2', second],
      ['load 3', third],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      const assets = hits.filter((h) => h.path.startsWith('/assets/'));
      const byPath = new Map<string, Hit[]>();
      for (const hit of assets) {
        byPath.set(hit.path, [...(byPath.get(hit.path) ?? []), hit]);
      }
      const doubled = [...byPath.entries()].filter(
        ([, rows]) => rows.some((r) => r.fromServiceWorker) && rows.some((r) => !r.fromServiceWorker),
      );
      expect(doubled.map(([path]) => path), `${label}: served AND fetched`).toEqual([]);
    }
  });

  test('BUG-03 the only worker script the browser refetches is fudic-sw.js', async ({
    page,
    context,
  }) => {
    const { second, third } = await threeLoads(page, context);
    for (const [label, hits] of [
      ['load 2', second],
      ['load 3', third],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      // The update check MAY refetch the worker script — that is correct, and the point
      // of `updateViaCache: 'none'`; whether it happens on a given load is the browser's
      // business. What must never come with it is a graph of chunks.
      const unintercepted = fromNetwork(hits)
        .filter((h) => h.path.endsWith('.js'))
        .map((h) => h.path);
      expect([...new Set(unintercepted)].filter((p) => p !== SW), `${label}: extra scripts`).toEqual(
        [],
      );
    }
  });

  test('BUG-03 a recycled worker refetches one file, not a graph', async ({ page, context }) => {
    // The observation that named BUG-03: `/assets/messages-*.js` reappeared whenever the
    // worker was recycled, because the browser's WORKER SCRIPT LOADER refetched the whole
    // static import graph — and that graph does not pass through the fetch handler of the
    // worker it belongs to, nor (with `updateViaCache: 'none'`) through the HTTP cache.
    const recorder = record(context);
    await measure(recorder, page, () => page.goto('/'), { awaitControl: true, settleMs: 2000 });

    const cdp = await context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');

    const afterRestart = await measure(recorder, page, () => page.reload(), { settleMs: 2500 });
    console.log(render('AFTER stopAllWorkers', afterRestart));
    const scripts = [...new Set(fromNetwork(afterRestart).filter((h) => h.path.endsWith('.js')).map((h) => h.path))];
    expect(scripts.filter((p) => p !== SW), 'a recycled worker pulled extra files').toEqual([]);
  });

  test('BUG-02 no document is ever fetched by its .html file name', async ({ page, context }) => {
    const { first, second, third } = await threeLoads(page, context);
    const all = [...first, ...second, ...third];
    expect(all.filter((h) => h.path.endsWith('.html')).map((h) => h.path)).toEqual([]);
  });

  test('from load 2 on, the navigation itself is served by the Service Worker', async ({
    page,
    context,
  }) => {
    const { second, third } = await threeLoads(page, context);
    for (const [label, hits] of [
      ['load 2', second],
      ['load 3', third],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      const document = hits.filter((h) => h.type === 'document' && h.path === '/');
      expect(document.length, `${label}: one document request`).toBe(1);
      expect(document[0]!.fromServiceWorker, `${label}: the SW served the navigation`).toBe(true);
    }
  });

  test('BUG-04 §6.12 the first refresh goes to the network for nothing at all', async ({
    page,
    context,
  }) => {
    const { second, third } = await threeLoads(page, context);
    for (const [label, hits] of [
      ['load 2', second],
      ['load 3', third],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      // The whole of BUG-04 in one assertion: the second load used to refetch
      // `/fudic-main.js` because the entry `install` wrote could not be matched by the
      // request the page makes. It must now be indistinguishable from the third.
      const main = servedBy(hits, MAIN);
      expect(main.length, `${label}: ${MAIN} was requested`).toBeGreaterThan(0);
      expect(main.some((h) => h.byServiceWorker), `${label}: the SW went to the network for ${MAIN}`).toBe(
        false,
      );
      // At most the worker update check may cross the wire.
      const unintercepted = new Set(fromNetwork(hits).map((h) => h.path));
      for (const path of unintercepted) {
        expect([SW], `${label}: ${path} went to the network`).toContain(path);
      }
    }
  });

  test('BUG-04 §6.13 one entry per URL, and every one of them sealed', async ({ page, context }) => {
    await threeLoads(page, context);
    const dumps = await dumpCaches(page);
    console.log(renderCaches(dumps));
    expect(dumps.length, 'the four caches exist').toBeGreaterThan(0);
    for (const dump of dumps) {
      const urls = dump.entries.map((e) => e.url);
      expect(new Set(urls).size, `${dump.name}: duplicate URLs ${urls.join(', ')}`).toBe(urls.length);
      for (const entry of dump.entries) {
        // `install` used to be the one writer that did not go through the Store, so its
        // entries carried no stamp — the visible half of carrying a different key too.
        expect(
          entry.responseHeaders.some(([name]) => name === 'x-fudic-stored'),
          `${dump.name}: ${entry.url} is not sealed`,
        ).toBe(true);
      }
    }
  });

  test('the manifest never goes to the network once the SW is in control', async ({
    page,
    context,
  }) => {
    const { second, third } = await threeLoads(page, context);
    for (const [label, hits] of [
      ['load 2', second],
      ['load 3', third],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      const manifest = servedBy(hits, MANIFEST).filter((h) => !h.byServiceWorker);
      expect(
        manifest.every((h) => h.fromServiceWorker),
        `${label}: ${MANIFEST} from the network`,
      ).toBe(true);
    }
  });
});
