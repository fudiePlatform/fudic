/**
 * SDD-17 §6 — the hydration runtime in a real browser: criteria 1–14 and 23, the warm of
 * 15–21, and the two channels of criterion 24.
 *
 * It runs in the three shapes the framework has (see `playwright.config.ts`), and that is
 * what makes criterion 24 a measurement instead of a claim: `preview` is a real build with
 * `sw.json`, so warm travels by `postMessage` and lands in Cache Storage; `dev` and `nosw`
 * have no Service Worker anywhere, so warm is a `<link rel="modulepreload">` and the chunk
 * URL comes from the dev server or from the build id respectively. **Every criterion below
 * is asserted in all three**: a warm criterion that only passed with a worker would not be
 * verified, and hydration itself must not notice the difference.
 *
 * Everything is read off `/hidratacion`, which is the page §6 describes: two `app-counter`
 * plus one `app-toggle` above the fold, TWO four-level composition chains, an emitter and its
 * bus subscriber, a tag below the fold and one inside a closed `<details>`.
 */

import { test, expect, type Page } from '@playwright/test';
import { fromNetwork, record, type Hit, type Recorder } from './traffic.js';

interface Hydrated {
  readonly id: number;
  readonly tag: string;
  readonly ms: string;
  readonly from: 'downloaded' | 'shared-chunk' | 'bus' | 'subtree';
}

declare global {
  interface Window {
    __ready: boolean;
    __hydrated: Hydrated[];
    __warmed: string[];
  }
}

/** The only difference between the three shapes, and the one thing the tests branch on. */
const hasWorker = (): boolean => test.info().project.name === 'preview';

/** Every component chunk the browser asked for, in order. Both URL shapes, one filter. */
function watchChunks(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (/\/h\/[a-z0-9-]+(-[0-9a-f]+)?\.js$/u.test(url.pathname)) {
      asked.push(url.pathname);
    }
  });
  return asked;
}

/** Load the scenario with the lifecycle events recorded from the very first byte. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__ready = false;
    window.__hydrated = [];
    window.__warmed = [];
    document.addEventListener('fud:ready', () => {
      window.__ready = true;
    });
    document.addEventListener('fud:hydrated', (e) => {
      window.__hydrated.push((e as CustomEvent<Hydrated>).detail);
    });
    document.addEventListener('fud:warmed', (e) => {
      window.__warmed.push((e as CustomEvent<{ tag: string }>).detail.tag);
    });
  });
  await page.goto('/hidratacion');
  await page.waitForFunction(() => window.__ready);
  if (hasWorker()) {
    // Nothing is warm until somebody is controlling the page: on a FIRST load `controller`
    // is null, the order is queued, and `controllerchange` is what flushes it (§4.7.1).
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }
}

const trace = (page: Page): Promise<Hydrated[]> => page.evaluate(() => window.__hydrated);

/** Every custom element of the document that is still undefined, shadow roots included. */
const undefinedTags = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const out = new Set<string>();
    const walk = (root: Document | ShadowRoot): void => {
      // `[data-fud-id]` and not `:not(:defined)` alone: a level 1 component is HTML with a
      // declarative shadow root and no JS at all, so its tag is never registered and is
      // ALWAYS undefined — that is what level 1 IS, not a hydration that failed. The
      // question only means something about the instances the emit marked hydratable.
      for (const el of root.querySelectorAll('[data-fud-id]:not(:defined)')) out.add(el.localName);
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot !== null) walk(el.shadowRoot);
    };
    walk(document);
    return [...out].sort();
  });

const counter = (page: Page, i: number) => page.locator('app-counter').nth(i);
const parent = (page: Page, i: number) => page.locator('app-parent').nth(i);

test.describe('the gesture drives the hydration', () => {
  test('1 · the initial load evaluates not one component chunk', async ({ page }) => {
    await open(page);
    // Long enough for the warm to have been ordered and landed: what must hold is not that
    // the network was idle but that nothing was EVALUATED. A deposited chunk is bytes in a
    // cache or in the module map — no `customElements.define` ran, no component code did
    // (§4.7). The two are different axes and this is where they are told apart.
    await page.waitForTimeout(1500);

    // The browser's own way of saying it: everything is still un-upgraded, and the page is
    // painted anyway, because the shadow roots are declarative.
    expect(await undefinedTags(page)).toContain('app-counter');
    expect(await trace(page)).toEqual([]);
    await expect(counter(page, 0).locator('.value')).toHaveText('0');
  });

  test('2 · path 2 — the first click downloads the chunk AND counts', async ({ page }) => {
    const asked = watchChunks(page);
    await open(page);

    await counter(page, 0).locator('.inc').click();

    // The gesture was cancelled and replayed: it counts on this very first click.
    await expect(counter(page, 0).locator('.value')).toHaveText('1');
    expect(asked.filter((u) => u.includes('app-counter'))).toHaveLength(1);
    expect((await trace(page)).map((h) => `${h.from}:${h.tag}#${h.id}`)).toEqual([
      'downloaded:app-counter#0',
    ]);
    expect(await undefinedTags(page)).not.toContain('app-counter');
  });

  test('3 · path 3 — the sibling shares the chunk, and still counts on its first click', async ({
    page,
  }) => {
    const asked = watchChunks(page);
    await open(page);

    await counter(page, 0).locator('.inc').click();
    await expect(counter(page, 0).locator('.value')).toHaveText('1');
    await counter(page, 1).locator('.inc').click();

    // 5 · and each one reads ITS slice of the payload: one starts at 0, the other at 10.
    await expect(counter(page, 1).locator('.value')).toHaveText('11');
    await expect(counter(page, 0).locator('.value')).toHaveText('1');
    // One download for the tag, two instances.
    expect(asked.filter((u) => u.includes('app-counter'))).toHaveLength(1);
    const shared = (await trace(page)).at(-1);
    expect(shared?.from).toBe('shared-chunk');
    expect(shared?.ms).toBe('0.0');
    expect(shared?.id).toBe(1);
  });

  test('4 · path 1 — one click, one increment, never two', async ({ page }) => {
    await open(page);

    for (let i = 0; i < 3; i += 1) {
      await counter(page, 0).locator('.inc').click();
      await expect(counter(page, 0).locator('.value')).toHaveText(String(i + 1));
    }
    await counter(page, 1).locator('.inc').click();
    await counter(page, 1).locator('.inc').click();

    await expect(counter(page, 1).locator('.value')).toHaveText('12');
    // The runtime intervened once per instance and then withdrew for good.
    expect(await trace(page)).toHaveLength(2);
  });

  test('6 · once the chunk is there, an interaction is a plain listener call', async ({ page }) => {
    await open(page);
    await counter(page, 0).locator('.inc').click();
    await expect(counter(page, 0).locator('.value')).toHaveText('1');

    // Path 1: no download, no await, no replay. This is the INP the measurements assume.
    const ms = await page.evaluate(() => {
      const host = document.querySelector('app-counter')!;
      const button = host.shadowRoot!.querySelector('button')!;
      const t0 = performance.now();
      button.click();
      return performance.now() - t0;
    });
    expect(ms).toBeLessThan(50);
  });
});

test.describe('the composition cascade', () => {
  test('7 · post-order — the deepest first, the host last', async ({ page }) => {
    await open(page);

    await parent(page, 0).locator('.inc').click();
    await expect(parent(page, 0).locator('app-greatgrandchild .value')).toHaveText('1');

    const order = (await trace(page)).map((h) => h.tag);
    expect(order.indexOf('app-greatgrandchild')).toBeLessThan(order.indexOf('app-grandchild'));
    expect(order.indexOf('app-grandchild')).toBeLessThan(order.indexOf('app-child'));
    expect(order.indexOf('app-child')).toBeLessThan(order.indexOf('app-parent'));
    // The host is the last, and the only one that was `downloaded` rather than `subtree`.
    expect((await trace(page)).at(-1)).toMatchObject({ tag: 'app-parent', from: 'downloaded' });
  });

  test('8 · the parent is alive before the replay, and its handler runs after it', async ({
    page,
  }) => {
    await open(page);

    await parent(page, 0).locator('.inc').click();

    // `count` reaches 1 on the FIRST click: the handler ran, in the replay, with every
    // descendant already defined and upgraded.
    //
    // `.first()` because the CSS engine pierces open shadow roots, so `app-child .value`
    // also matches the `.value` of the two levels nested inside it. The one that belongs to
    // this level is the first in document order: every component in the chain paints its own
    // value before the host of the next one.
    await expect(parent(page, 0).locator('app-child .value').first()).toHaveText('1');
    await expect(parent(page, 0).locator('app-grandchild .value').first()).toHaveText('1');
    await expect(parent(page, 0).locator('app-greatgrandchild .value')).toHaveText('1');
  });

  test('9 · the preparation is BY TAG: the sibling chain is alive too', async ({ page }) => {
    await open(page);

    // Clicking the first prepares the subtree of BOTH instances, because defining the tag
    // upgrades both. This is the test that fails with `hydrateSubtreePostorder` alone.
    await parent(page, 0).locator('.inc').click();
    await expect(parent(page, 0).locator('app-greatgrandchild .value')).toHaveText('1');

    const raised = (await trace(page)).filter((h) => h.tag === 'app-greatgrandchild');
    expect(raised).toHaveLength(2);

    // And the second parent, which now takes path 3 — no download, no repair — still runs
    // its handler over a live subtree.
    await parent(page, 1).locator('.inc').click();
    await expect(parent(page, 1).locator('app-greatgrandchild .value')).toHaveText('1');
    await expect(parent(page, 0).locator('app-greatgrandchild .value')).toHaveText('1');
  });
});

test.describe('the bus: the receiver, before the emitter', () => {
  const cart = (page: Page) => page.locator('shopping-cart');

  test('10 · order bus → subtree → host', async ({ page }) => {
    await open(page);

    await page.locator('product-list').locator('.add').first().click();
    await expect(cart(page).locator('.badge')).toHaveText('1');

    const order = (await trace(page)).map((h) => `${h.from}:${h.tag}`);
    expect(order.indexOf('bus:shopping-cart')).toBeLessThan(order.indexOf('downloaded:product-list'));
  });

  test('11 · the bus event is not lost on the first click', async ({ page }) => {
    await open(page);

    await page.locator('product-list').locator('.add').first().click();

    // The emit is born inside the replayed handler, and the receiver — already alive —
    // takes it in its own propagation. One replay, never two.
    await expect(cart(page).locator('.badge')).toHaveText('1');
    await expect(cart(page).locator('.total')).toHaveText('3.50 €');
  });

  test('12 · no double fire — three products, three increments', async ({ page }) => {
    await open(page);

    const buttons = page.locator('product-list').locator('.add');
    await buttons.nth(0).click();
    await expect(cart(page).locator('.badge')).toHaveText('1');
    await buttons.nth(1).click();
    await buttons.nth(2).click();

    await expect(cart(page).locator('.badge')).toHaveText('3');
    await expect(cart(page).locator('.total')).toHaveText('7.50 €');
  });

  test('13 · the subscriber listens on `document`, which is why it hears at all', async ({
    page,
  }) => {
    await open(page);
    await page.locator('product-list').locator('.add').first().click();
    await expect(cart(page).locator('.badge')).toHaveText('1');

    // An event dispatched on the document itself reaches it: the `bus:` binding hangs off
    // the page's common ancestor, not off the host.
    await page.evaluate(() =>
      document.dispatchEvent(new CustomEvent('carrito', { detail: 2, bubbles: true })),
    );
    await expect(cart(page).locator('.badge')).toHaveText('2');
    await expect(cart(page).locator('.total')).toHaveText('5.50 €');
  });

  test('14 · a clean teardown: disconnecting removes the document listener', async ({ page }) => {
    await open(page);
    await page.locator('product-list').locator('.add').first().click();
    await expect(cart(page).locator('.badge')).toHaveText('1');

    const badgeAfter = await page.evaluate(() => {
      const host = document.querySelector('shopping-cart')!;
      host.remove(); // `disconnectedCallback` → `r()` → the disposer of the `bus:` binding
      document.dispatchEvent(new CustomEvent('carrito', { detail: 99, bubbles: true }));
      return host.shadowRoot!.querySelector('.badge')!.textContent;
    });
    expect(badgeAfter).toBe('1'); // no effect, and no leak
  });
});

/**
 * SDD-17 §6, criteria 15–21, and §4.7.1's half of criterion 24.
 *
 * The observable both channels share is `fud:warmed`, and it means the same thing in each:
 * the tag's chunk is in place and NOT evaluated. Where a channel can say more it is asked for
 * more — Cache Storage holds the graph with a worker, the module map holds it without one —
 * but the propositions are the same propositions.
 */
test.describe('warm: the network spent in proportion to what is seen', () => {
  /** The tags the channel has confirmed as deposited, whole graph included. */
  const warmed = (page: Page): Promise<string[]> => page.evaluate(() => window.__warmed);

  /** Wait until `tag` is confirmed, reporting what WAS confirmed if it never is. */
  const waitWarmed = async (page: Page, tag: string): Promise<void> => {
    await expect.poll(() => warmed(page), { timeout: 10_000 }).toContain(tag);
  };

  /** Every hydration chunk in Cache Storage — the worker channel's own record. */
  const cached = (page: Page): Promise<string[]> =>
    page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) out.push(new URL(request.url).pathname);
      }
      return out;
    });

  /** Requests for a tag's chunk, whoever issued them — page, or worker on its own egress. */
  const chunkHits = (recorder: Recorder, tag: string): readonly Hit[] =>
    recorder.hits().filter((h) => new RegExp(`/h/${tag}(-[0-9a-f]+)?\\.js`, 'u').test(h.path));

  /** The tags of the two above-the-fold groups, and the two that must stay untouched. */
  const VISIBLE = ['app-counter', 'app-toggle', 'app-parent'];
  const BELOW = ['app-below', 'app-cold'];
  /** Everything the first viewport drags in, closure included (§4.7). */
  const ABOVE_THE_FOLD = [...VISIBLE, 'app-child', 'app-grandchild', 'app-greatgrandchild'];

  /**
   * Wait for the whole first-viewport warm to be done with.
   *
   * A measurement of what one gesture costs has to start with the background work finished:
   * the order covers six tags at once, so resetting the recorder as soon as the FIRST of
   * them lands leaves the other five crossing the wire inside the window being measured.
   */
  const settleWarm = async (page: Page): Promise<void> => {
    for (const tag of ABOVE_THE_FOLD) await waitWarmed(page, tag);
    await page.waitForTimeout(500);
  };

  test('15 · only the chunks of what the first viewport shows are anticipated', async ({
    page,
  }) => {
    await open(page);
    await waitWarmed(page, 'app-counter');
    await page.waitForTimeout(1000); // room for an order that should never come

    const tags = await warmed(page);
    expect(tags).toEqual(expect.arrayContaining(VISIBLE));
    for (const tag of BELOW) expect(tags).not.toContain(tag);

    if (hasWorker()) {
      // The worker channel can be asked the stronger question, and Cache Storage answers it.
      const paths = await cached(page);
      expect(paths.some((p) => p.includes('app-counter'))).toBe(true);
      expect(paths.some((p) => p.includes('app-below'))).toBe(false);
    }
  });

  test('16 · the tag below the fold is warmed by the scroll, and not before', async ({ page }) => {
    await open(page);
    await waitWarmed(page, 'app-counter');
    expect(await warmed(page)).not.toContain('app-below');

    await page.locator('app-below').scrollIntoViewIfNeeded();

    await waitWarmed(page, 'app-below');
  });

  test('17 · by tag, not by instance: two counters, one download', async ({ page, context }) => {
    const recorder = record(context);
    await open(page);
    await waitWarmed(page, 'app-counter');
    await page.waitForTimeout(500);

    expect(chunkHits(recorder, 'app-counter')).toHaveLength(1);
  });

  test('18 · the transitive closure travels with the tag', async ({ page }) => {
    await open(page);

    // The subtree: `app-parent` is visible, and the whole chain comes with it (§4.4).
    for (const tag of ['app-child', 'app-grandchild', 'app-greatgrandchild']) {
      await waitWarmed(page, tag);
    }
    // The bus: a receiver is a sibling the emitter's handler will need alive, so it warms
    // with the emitter and not on a viewport of its own.
    await page.locator('product-list').scrollIntoViewIfNeeded();
    await waitWarmed(page, 'shopping-cart');
  });

  test('19 · warm is background network, at a low priority', async ({ page, context }) => {
    if (hasWorker()) {
      // The worker downloads with `new Request(url, { priority: 'low' })` (`router.ts`,
      // `deposit`), and neither the Request interface nor the page's CDP session exposes the
      // priority of a request the WORKER issued — the page never makes it. What is
      // observable here is that the deposit is the worker's own egress and not the page's,
      // which is the other half of "it does not compete with the critical path".
      const recorder = record(context);
      await open(page);
      await waitWarmed(page, 'app-counter');
      const hits = chunkHits(recorder, 'app-counter');
      expect(hits).toHaveLength(1);
      expect(hits.every((h) => h.byServiceWorker)).toBe(true);
      return;
    }
    // Without a worker the request is the page's own, and every warm link declares itself
    // low. What Chromium does with the declaration is Chromium's: measured here, a
    // `modulepreload` keeps a script's priority whatever `fetchpriority` says (a plain link
    // with no attribute at all reports the same `High`), so the assertion is the order the
    // channel places, which is the only half the framework owns.
    const cdp = await context.newCDPSession(page);
    const priorities: string[] = [];
    await cdp.send('Network.enable');
    cdp.on('Network.requestWillBeSent', (e) => {
      if (/\/h\/app-counter(-[0-9a-f]+)?\.js/u.test(e.request.url)) {
        priorities.push(e.request.initialPriority);
      }
    });

    await open(page);
    await waitWarmed(page, 'app-counter');

    expect(priorities).toHaveLength(1); // one order, and it was the warm's
    const declared = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel=modulepreload]')].map((l) =>
        l.getAttribute('fetchpriority'),
      ),
    );
    expect(declared.length).toBeGreaterThan(0);
    expect(new Set(declared)).toEqual(new Set(['low']));
  });

  test('20 · idempotent: one order per tag, and a reload re-downloads nothing', async ({
    page,
    context,
  }) => {
    const recorder = record(context);
    await open(page);
    await waitWarmed(page, 'app-counter');

    // The client layer: an instance that leaves the viewport and comes back must not
    // re-order, and the sibling instance never ordered anything of its own.
    await page.locator('app-below').scrollIntoViewIfNeeded();
    await page.locator('app-counter').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    expect(chunkHits(recorder, 'app-counter')).toHaveLength(1);

    if (!hasWorker()) {
      return; // nothing survives a navigation without a worker: that is the whole asymmetry
    }
    // The worker layer: `cache.match` before downloading, so a reload with the worker in
    // control costs a cache read and no wire at all.
    recorder.reset();
    await page.reload();
    await page.waitForFunction(() => window.__ready);
    await waitWarmed(page, 'app-counter');
    expect(fromNetwork(recorder.hits()).filter((h) => /\/h\//u.test(h.path))).toEqual([]);
  });

  test('21 · after the warm, the gesture costs the network nothing it can avoid', async ({
    page,
    context,
  }) => {
    const recorder = record(context);
    await open(page);
    await settleWarm(page);

    recorder.reset();
    await counter(page, 0).locator('.inc').click();
    await expect(counter(page, 0).locator('.value')).toHaveText('1');
    await page.waitForTimeout(500);
    const first = fromNetwork(recorder.hits()).map((h) => h.path);

    if (hasWorker()) {
      // THE criterion, and the reason §4.7 warms the graph and not the bare chunk: what the
      // chunk imports — the shared code the client pass extracts, with its content hash —
      // used to be downloaded inside the gesture with the tag already cached.
      expect(first).toEqual([]);
      const paths = await cached(page);
      const shared = paths.filter((p) => /^\/assets\/[^/]+\.js$/u.test(p));
      expect(
        shared.length,
        `the imports of the chunk are in cache: ${paths.join(', ')}`,
      ).toBeGreaterThan(0);
      return;
    }

    // The asymmetry the measurement found, and §4.7 states: a `modulepreload` deposits the
    // module and NOT its descendants — Chromium fetches no static import of a preloaded
    // module until something evaluates it — and the page cannot name them, because a shared
    // chunk carries a content hash that only the manifest knows. So the first gesture of the
    // page pays for the shared code, and no chunk of a warmed tag beyond it.
    expect(
      first.some((p) => /\/h\//u.test(p)),
      `a warmed chunk crossed the wire: ${first.join(', ')}`,
    ).toBe(false);
    recorder.reset();
    await page.locator('app-toggle').locator('.flip').click();
    await page.waitForTimeout(500);
    // ONCE per page, not once per tag: the second warmed tag hydrates off the module map.
    expect(fromNetwork(recorder.hits()).map((h) => h.path)).toEqual([]);
  });

  test('22 · a tag no warm ever reached still hydrates, paying the network in the gesture', async ({
    page,
    context,
  }) => {
    const recorder = record(context);
    await open(page);
    await waitWarmed(page, 'app-counter');
    expect(await warmed(page)).not.toContain('app-cold');

    recorder.reset();
    await page.locator('details').locator('summary').click();
    await page.locator('app-cold').locator('.hit').click();

    // It counts on its first click like every other one: warm is an optimization, never a
    // requirement (§4.7). And this one really did cross the wire — with a worker the page
    // asks, the worker misses its cache and goes out, which is two hits for one download.
    await expect(page.locator('app-cold').locator('.value')).toHaveText('1');
    const cold = chunkHits(recorder, 'app-cold');
    expect(cold.length).toBeGreaterThan(0);
    expect(fromNetwork(cold).length, 'the cold chunk never crossed the wire').toBeGreaterThan(0);
  });

  test('24 · the shape decides the channel, and no message is ever posted unheard', async ({
    page,
  }) => {
    await open(page);
    const controlled = await page.evaluate(
      () => 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
    );
    expect(controlled).toBe(hasWorker());

    // The choice is made at emit time, so the module a page downloads carries ONE channel.
    // Where there is no worker there is no `postMessage` in the file at all: the case is not
    // "post and hope", it is code that was never emitted (§4.7.1). That the other channel is
    // the live one is what the seven tests above measured.
    const main = await page.evaluate(async () => (await fetch('/fudic-main.js')).text());
    expect(main.includes('postMessage')).toBe(hasWorker());
  });
});

test('23 · after interacting with everything, nothing is left undefined', async ({ page }) => {
  await open(page);

  await counter(page, 0).locator('.inc').click();
  await counter(page, 1).locator('.inc').click();
  await page.locator('app-toggle').locator('.flip').click();
  await parent(page, 0).locator('.inc').click();
  await parent(page, 1).locator('.inc').click();
  await page.locator('product-list').locator('.add').first().click();
  await page.locator('app-below').scrollIntoViewIfNeeded();
  await page.locator('app-below').locator('.look').click();
  await page.locator('details').locator('summary').click();
  await page.locator('app-cold').locator('.hit').click();
  await expect(page.locator('app-cold').locator('.value')).toHaveText('1');

  // Inside the shadow roots too: the walk of §4.4 is the same one the runtime performs.
  expect(await undefinedTags(page)).toEqual([]);
});
