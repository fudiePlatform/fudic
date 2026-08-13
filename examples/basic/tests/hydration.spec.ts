/**
 * SDD-17 §6, criteria 1–14 and 23 — the hydration runtime in a real browser.
 *
 * It runs in the three shapes the framework has (see `playwright.config.ts`): `dev`, with no
 * Service Worker anywhere and chunk URLs served per tag by the dev server; and `nosw`, a real
 * build with no `sw.json`, where the URL is DERIVED from the build id. Both are the milestone
 * of SDD-17 §4.7.1 — hydration does not depend on a Service Worker, and there is not a line
 * of warm in either.
 *
 * Everything is read off `/hidratacion`, which is the page §6 describes: two `app-counter`
 * plus one `app-toggle` above the fold, TWO four-level composition chains, an emitter and its
 * bus subscriber, a tag below the fold and one inside a closed `<details>`.
 */

import { test, expect, type Page } from '@playwright/test';

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
  }
}

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
    document.addEventListener('fud:ready', () => {
      window.__ready = true;
    });
    document.addEventListener('fud:hydrated', (e) => {
      window.__hydrated.push((e as CustomEvent<Hydrated>).detail);
    });
  });
  await page.goto('/hidratacion');
  await page.waitForFunction(() => window.__ready);
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
    const asked = watchChunks(page);
    await open(page);

    expect(asked).toEqual([]);
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
