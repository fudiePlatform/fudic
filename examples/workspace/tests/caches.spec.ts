/**
 * Two applications, one origin, and the store they share without meaning to (BUG-33).
 *
 * `/` is `@fudic/example-tienda` and `/admin/` is `@fudic/example-admin`. They are two
 * projects: two `package.json`, two builds, two Service Workers, no shared file. The one
 * thing they cannot help sharing is the origin's `CacheStorage`, because `caches.keys()`
 * enumerates the origin and is bounded by no worker's scope.
 *
 * Before the fix, the `activate` of whichever worker ran last deleted every cache whose
 * name did not end in ITS build id — which is every cache of the other application. The
 * app you did not visit last stopped opening offline, and that is the promise of this
 * framework, not a detail of it.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

interface App {
  readonly name: string;
  /** Where it is published on the shared origin. */
  readonly home: string;
  /** The pathname of its worker's script — NOT a suffix: see `controllerOf`. */
  readonly worker: string;
  /** Its `id` in `fudic.json`, which is what namespaces its caches. */
  readonly id: string;
  readonly marker: string;
}

const TIENDA: App = {
  name: 'tienda',
  home: '/',
  worker: '/fudic-sw.js',
  id: 'tienda',
  marker: '[data-app="tienda"]',
};

// `tienda` is a PREFIX of `tienda-admin`. That is on purpose: a purge that compared
// prefixes instead of widths would have the storefront delete this app's caches, which is
// the same defect one size smaller.
const ADMIN: App = {
  name: 'admin',
  home: '/admin/',
  worker: '/admin/fudic-sw.js',
  id: 'tienda-admin',
  marker: '[data-app="tienda-admin"]',
};

/** `<kind>-<app>-<build>`, with the build id at a fixed width. */
const CACHE_NAME = /^(?:shell|routes|pages|data)-(.+)-[0-9a-f]{8}$/u;

function ownedBy(names: readonly string[], id: string): string[] {
  return names.filter((name) => CACHE_NAME.exec(name)?.[1] === id);
}

/**
 * The pathname of the script controlling this page, or `null`.
 *
 * A pathname and never a suffix: `/admin/fudic-sw.js`.endsWith(`/fudic-sw.js`) is true,
 * so a suffix comparison calls the wrong worker the right one.
 */
function controllerOf(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const worker = navigator.serviceWorker.controller;
    // Never return the registration itself: it is not serializable.
    return worker === null ? null : new URL(worker.scriptURL).pathname;
  });
}

/**
 * Open an app and wait until ITS OWN worker is the one controlling the page.
 *
 * The storefront's scope is `/`, which also covers `/admin/`. So on a first visit to the
 * back office the page is legitimately controlled by the storefront's worker — it declines
 * what is not its own and the network answers — and "some worker is in control" is a
 * condition the WRONG worker satisfies.
 */
async function open(page: Page, app: App): Promise<void> {
  await page.goto(app.home);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  for (let attempt = 0; attempt < 5 && (await controllerOf(page)) !== app.worker; attempt++) {
    await page.reload();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
  }
  expect(await controllerOf(page), `${app.home} is not controlled by ${app.worker}`).toBe(
    app.worker,
  );
  // The worker writes what this load made it fetch behind the load itself.
  await page.waitForTimeout(1500);
}

function cacheNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => (await caches.keys()).sort());
}

async function offline(context: BrowserContext, body: () => Promise<void>): Promise<void> {
  await context.setOffline(true);
  try {
    await body();
  } finally {
    await context.setOffline(false);
  }
}

test.describe('two apps on one origin', () => {
  test('the storefront still opens offline after the back office has been visited', async ({
    page,
    context,
  }) => {
    await open(page, TIENDA);
    const afterTienda = ownedBy(await cacheNames(page), TIENDA.id);
    expect(afterTienda.length, 'the storefront wrote no caches at all').toBeGreaterThan(0);

    await open(page, ADMIN);
    expect(
      ownedBy(await cacheNames(page), TIENDA.id),
      'the back office deleted caches belonging to the storefront',
    ).toEqual(afterTienda);

    await offline(context, async () => {
      await page.goto(TIENDA.home);
      await expect(page.locator(TIENDA.marker)).toBeVisible();
    });
  });

  test('the back office still opens offline after the storefront has been visited', async ({
    page,
    context,
  }) => {
    await open(page, ADMIN);
    const afterAdmin = ownedBy(await cacheNames(page), ADMIN.id);
    expect(afterAdmin.length, 'the back office wrote no caches at all').toBeGreaterThan(0);

    await open(page, TIENDA);
    expect(
      ownedBy(await cacheNames(page), ADMIN.id),
      'the storefront deleted caches belonging to the back office — the width cut failed',
    ).toEqual(afterAdmin);

    await offline(context, async () => {
      await page.goto(ADMIN.home);
      await expect(page.locator(ADMIN.marker)).toBeVisible();
    });
  });

  test('neither worker deletes a cache it did not write', async ({ page }) => {
    await open(page, TIENDA);
    const written = await cacheNames(page);

    await open(page, ADMIN);
    const both = await cacheNames(page);

    // Nothing the storefront wrote is gone, and the back office added its own on top.
    expect(both).toEqual(expect.arrayContaining(written));
    expect(ownedBy(both, TIENDA.id).length).toBeGreaterThan(0);
    expect(ownedBy(both, ADMIN.id).length).toBeGreaterThan(0);

    // Every cache on this origin is attributable to one of the two applications. A name
    // without an app segment is the pre-BUG-33 shape, and it must not be written any more.
    expect(both.filter((name) => CACHE_NAME.exec(name) === null)).toEqual([]);
  });
});
