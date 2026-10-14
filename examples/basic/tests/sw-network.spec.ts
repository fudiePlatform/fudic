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
  runtimeEntry,
  servedBy,
  type Hit,
} from './traffic.js';

const MAIN = runtimeEntry();
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

/**
 * The paths `install` precached: the shell cache, read once the worker controls the page.
 *
 * It is not the whole of `/assets`. Since SDD-49 (§4.9, criterion 37) a sheet of the document
 * is cut per page — `/assets/tokens-<hash>.css`, one copy for each set of rules a page uses —
 * and those copies stay OUT of the shell: the `assets` class of `sw.json` (`/assets/**`,
 * cache-first) stores each the first time its page asks. So on the first refresh the worker
 * misses, fetches it itself and serves it; from then on it is a cache hit like the rest.
 */
async function shellOf(page: import('@playwright/test').Page): Promise<ReadonlySet<string>> {
  const dumps = await dumpCaches(page);
  const shell = dumps.filter((d) => d.name.startsWith('shell-')).flatMap((d) => d.entries);
  return new Set(shell.map((e) => new URL(e.url).pathname));
}

/** A per-page cut of a document sheet: an `/assets` stylesheet the shell does not hold. */
const trimmedSheet = (shell: ReadonlySet<string>) => (path: string): boolean =>
  path.startsWith('/assets/') && path.endsWith('.css') && !shell.has(path);

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
    const recorder = record(context);
    await measure(recorder, page, () => page.goto('/'), { awaitControl: true, settleMs: 2000 });
    const isTrimmed = trimmedSheet(await shellOf(page));
    const second = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });
    const third = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });

    // Soft, so load 3 is checked even when load 2 fails: it used to stop at the first.
    for (const [label, hits, firstMissAllowed] of [
      ['load 2', second, true],
      ['load 3', third, false],
    ] as ReadonlyArray<readonly [string, readonly Hit[], boolean]>) {
      const assets = hits.filter((h) => h.path.startsWith('/assets/'));
      const byPath = new Map<string, Hit[]>();
      for (const hit of assets) {
        byPath.set(hit.path, [...(byPath.get(hit.path) ?? []), hit]);
      }
      const doubled = [...byPath.entries()].filter(([path, rows]) => {
        const served = rows.some((r) => r.fromServiceWorker);
        const fetched = rows.filter((r) => !r.fromServiceWorker);
        if (!served || fetched.length === 0) return false;
        // On the first refresh a per-page sheet is the worker's own cache miss (SDD-49 §4.9):
        // it fetches it and serves it. The page itself must never go around it.
        return !(firstMissAllowed && isTrimmed(path) && fetched.every((r) => r.byServiceWorker));
      });
      expect.soft(doubled.map(([path]) => path), `${label}: served AND fetched`).toEqual([]);
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
    const recorder = record(context);
    await measure(recorder, page, () => page.goto('/'), { awaitControl: true, settleMs: 2000 });
    const isTrimmed = trimmedSheet(await shellOf(page));
    const second = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });
    const third = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });

    // Soft, so load 3 is checked even when load 2 fails: it used to stop at the first.
    for (const [label, hits, firstMissAllowed] of [
      ['load 2', second, true],
      ['load 3', third, false],
    ] as ReadonlyArray<readonly [string, readonly Hit[], boolean]>) {
      // The whole of BUG-04 in one assertion: the second load used to refetch
      // `/fudic-main.js` because the entry `install` wrote could not be matched by the
      // request the page makes. What the shell holds must come from it on both loads.
      const main = servedBy(hits, MAIN);
      expect.soft(main.length, `${label}: ${MAIN} was requested`).toBeGreaterThan(0);
      expect
        .soft(main.some((h) => h.byServiceWorker), `${label}: the SW went to the network for ${MAIN}`)
        .toBe(false);
      // At most the worker update check may cross the wire — and, on the first refresh only,
      // the per-page sheets the shell does not hold (SDD-49 §4.9), fetched by the worker
      // itself on its cache miss, never by the page around it.
      for (const hit of fromNetwork(hits)) {
        if (hit.path === SW) continue;
        if (firstMissAllowed && isTrimmed(hit.path)) {
          expect.soft(hit.byServiceWorker, `${label}: ${hit.path} went to the network around the SW`).toBe(true);
          continue;
        }
        expect.soft([SW], `${label}: ${hit.path} went to the network`).toContain(hit.path);
      }
    }
  });

  test('SDD-49 criterion 37: a per-page sheet is stored the first time its page asks', async ({
    page,
    context,
  }) => {
    const recorder = record(context);
    await measure(recorder, page, () => page.goto('/'), { awaitControl: true, settleMs: 2000 });
    const shell = await shellOf(page);
    const second = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });

    // The sheets the page asked for that the shell does not hold: the per-page cuts.
    const isTrimmed = trimmedSheet(shell);
    const asked = [...new Set(second.map((h) => h.path).filter(isTrimmed))];
    expect(asked.length, 'load 2 asked for no per-page sheet').toBeGreaterThan(0);
    expect(asked.every((path) => /^\/assets\/tokens-[^/]+\.css$/u.test(path)), asked.join(', ')).toBe(true);

    // Once asked, each sits in a cache of its own class, outside the shell.
    const stored = new Set(
      (await dumpCaches(page))
        .filter((d) => !d.name.startsWith('shell-'))
        .flatMap((d) => d.entries.map((e) => new URL(e.url).pathname)),
    );
    for (const path of asked) {
      expect.soft(stored.has(path), `${path} was not stored after load 2`).toBe(true);
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
