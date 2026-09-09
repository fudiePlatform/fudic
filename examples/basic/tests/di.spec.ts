/**
 * SDD-38 §6.27–§6.28 — dependency injection in a real browser.
 *
 * `/di` is the page the criterion describes: an N1 ancestor that declares `provide(Cart)`, an
 * N3 descendant that injects it, and a root `Logger`. What is being measured is that the
 * ancestor never runs — no `data-fud-id`, no chunk — while its provider still reaches the
 * browser, and that the cart the client injects is the one the seed rebuilt: the same two
 * lines the server painted, not an empty one.
 *
 * And the contrast that closes the SDD: `/mapas` has no DI at all, and publishes neither of
 * the two blocks.
 */

import { test, expect, type Page } from '@playwright/test';

// Playwright's CSS engine pierces open shadow roots on its own, so a plain descendant
// selector reaches inside `di-panel`'s template.
const text = (page: Page, id: string): Promise<string> =>
  page.locator(`di-panel [data-id="${id}"]`).innerText();

test.describe('/di — a service shared by components that cannot see each other', () => {
  test('the owner is level 1: no identity, and no chunk of its own', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (/\/h\//u.test(path)) asked.push(path);
    });

    await page.goto('/di');
    await page.locator('di-panel [data-id="cart"]').waitFor();

    // It declares a provider and injects nothing, so it never hydrates.
    await expect(page.locator('di-owner')).not.toHaveAttribute('data-fud-id', /./u);
    expect(asked.some((p) => /di-owner-[0-9a-f]+\.js$/u.test(p))).toBe(false);
    // Its factory still reaches the browser — through its IoC module, which is not its chunk.
    expect(asked.some((p) => /di-owner\.ioc/u.test(p))).toBe(true);
  });

  test('the page publishes the container tree and the seed', async ({ page }) => {
    await page.goto('/di');
    const ioc = await page.locator('#fud-ioc').textContent();
    const seed = await page.locator('#fud-di').textContent();

    // One owner below the root: its parent is node 0, and the tag says whose it is.
    expect(JSON.parse(ioc ?? '')).toEqual([
      [-1, 0],
      ['', 'di-owner'],
    ]);
    expect(JSON.parse(seed ?? '')).toEqual({ lines: ['manzanas', 'peras'] });
  });

  test('the server painted with the ancestor instance, and the client rebuilds it', async ({
    page,
  }) => {
    await page.goto('/di');
    // Painted by the server, from the published value.
    expect(await text(page, 'count')).toBe('2');
    expect(await text(page, 'last')).toBe('peras');

    // The click hydrates the panel: its `inject(Cart)` resolves through the node its slice
    // carried, up to the container `di-owner` owns — and that cart was built from the seed,
    // so it already holds the two lines the server painted.
    await page.locator('di-panel button.add').click();
    await expect(page.locator('di-panel [data-id="count"]')).toHaveText('3');
    await expect(page.locator('di-panel [data-id="last"]')).toHaveText('línea 3');

    // A second click keeps counting on the SAME cart: nobody built a second one.
    await page.locator('di-panel button.add').click();
    await expect(page.locator('di-panel [data-id="count"]')).toHaveText('4');
  });

  test('two components that cannot see each other hold the same two objects', async ({
    page,
  }) => {
    await page.goto('/di');
    // The click hydrates `di-panel` and, in post-order, the `di-badge` inside its shadow.
    // Both inject, from two different containers of the same chain.
    await page.locator('di-panel button.add').click();
    await expect(page.locator('di-badge [data-id="badge-lines"]')).toHaveText('2');

    const cart = await text(page, 'cart');
    const logger = await text(page, 'logger');
    // The cart stops at the ancestor that provides it; the logger climbs to the root. One
    // object each, and the ids say so — nobody built a second one on the way down.
    await expect(page.locator('di-badge [data-id="badge-cart"]')).toHaveText(cart);
    await expect(page.locator('di-badge [data-id="badge-logger"]')).toHaveText(logger);
    expect(logger).toMatch(/^Logger#\d+$/u);
  });
});

test.describe('a page with no DI', () => {
  test('publishes neither block and asks for nothing of the injector', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (r) => asked.push(new URL(r.url()).pathname));

    await page.goto('/mapas');
    await page.locator('bus-picker').waitFor();

    await expect(page.locator('#fud-ioc')).toHaveCount(0);
    await expect(page.locator('#fud-di')).toHaveCount(0);
    expect(asked.some((p) => /\.ioc/u.test(p))).toBe(false);
  });
});
