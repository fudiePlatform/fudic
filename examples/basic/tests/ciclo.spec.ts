/**
 * SDD-86 in a browser — `/ciclo`, in the real build (criteria 1, 10, 11, 27, 28).
 *
 * Every instance of `<ciclo-demo>`, the lazy `<ciclo-perezoso>` and the route itself write each
 * hook they run into the page's record (`<ol class="registro">`, «who · hook»), so every
 * assertion reads text the page wrote with its own hands, in the order things happened.
 *
 * The route hydrates at load (its top-level `effect`), and hands `.state` to its four
 * `ciclo-demo`, so they hydrate with it. `ciclo-perezoso` is in nobody's tree: it waits for a
 * gesture. The bfcache round trip needs Chrome's back-forward cache, which Playwright turns off
 * by default; this file turns it back on.
 */

import { expect, test, type Page } from '@playwright/test';

test.use({ launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'] } });

const registro = (page: Page) => page.locator('ol.registro li');
const lines = (page: Page): Promise<string[]> => registro(page).allTextContents().then((all) => all.map((l) => l.trim()));
const of = (all: readonly string[], who: string): string[] =>
  all.filter((l) => l.startsWith(`${who} · `)).map((l) => l.slice(who.length + 3));

/** The console errors of the page, collected from the first load. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page): Promise<void> {
  await page.goto('/ciclo');
  // The route is up when it has written its own afterHydrate and onConnect.
  await expect.poll(async () => of(await lines(page), 'ruta')).toEqual(['afterHydrate', 'onConnect']);
}

test.describe('the hooks of a component (criterion 1)', () => {
  test('the instance the server painted: beforeHydrate, afterHydrate, onConnect — nothing of creating', async ({ page }) => {
    const errors = errorsOf(page);
    await open(page);
    const all = await lines(page);
    for (const who of ['servidor', 'fila A', 'fila B']) {
      expect(of(all, who), who).toEqual(['beforeHydrate', 'afterHydrate', 'onConnect']);
    }
    expect(errors).toEqual([]);
  });

  test('a child hydrates before its parent: every instance is up before the route’s afterHydrate (criterion 10)', async ({ page }) => {
    await open(page);
    const all = await lines(page);
    const route = all.indexOf('ruta · afterHydrate');
    for (const who of ['servidor', 'fila A', 'fila B']) {
      expect(all.indexOf(`${who} · afterHydrate`), who).toBeLessThan(route);
    }
  });

  test('opening the @if creates one: beforeCreate, afterCreate, onConnect; closing it: onDisconnect, onDispose', async ({ page }) => {
    const errors = errorsOf(page);
    await open(page);
    await page.locator('button.limpiar').click();
    await expect(registro(page)).toHaveCount(0);

    await page.locator('button.abrir').click();
    await expect.poll(async () => of(await lines(page), 'creado')).toEqual(['beforeCreate', 'afterCreate', 'onConnect']);

    await page.locator('button.abrir').click();
    await expect
      .poll(async () => of(await lines(page), 'creado'))
      .toEqual(['beforeCreate', 'afterCreate', 'onConnect', 'onDisconnect', 'onDispose']);
    await expect(page.locator('ciclo-demo.creado')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('reordering the keyed rows: onDisconnect then onConnect, and no onDispose', async ({ page }) => {
    await open(page);
    await page.locator('button.limpiar').click();
    await page.locator('button.reordenar').click();
    await expect(page.locator('ciclo-demo.fila').first()).toContainText('fila B');
    await expect.poll(async () => (await lines(page)).length).toBeGreaterThan(0);
    const all = await lines(page);
    const moved = ['fila A', 'fila B'].map((who) => of(all, who)).filter((h) => h.length > 0);
    expect(moved.length).toBeGreaterThan(0);
    for (const hooks of moved) expect(hooks).toEqual(['onDisconnect', 'onConnect']);
    expect(all.some((l) => l.endsWith('onDispose'))).toBe(false);
  });

  test('changing state changes the host attribute and its border', async ({ page }) => {
    await open(page);
    const host = page.locator('ciclo-demo.servidor');
    await expect(host).toHaveAttribute('state', 'inactive');
    await expect(host).toHaveCSS('border-top-color', 'rgb(154, 160, 166)');
    await page.locator('button.alternar').click();
    await expect(host).toHaveAttribute('state', 'active');
    await expect(host).toHaveCSS('border-top-color', 'rgb(52, 168, 83)');
    await expect(page.locator('ciclo-demo.fila').first()).toHaveAttribute('state', 'active');
    await page.locator('button.alternar').click();
    await expect(host).toHaveAttribute('state', 'inactive');
  });
});

test.describe('the hooks of the route (criterion 1)', () => {
  test('the counter is read back from IndexedDB on reload', async ({ page }) => {
    const errors = errorsOf(page);
    await open(page);
    await expect(page.locator('output.contador')).toHaveText('0');
    await page.locator('button.sumar').click();
    await page.locator('button.sumar').click();
    await expect(page.locator('output.contador')).toHaveText('2');
    await page.reload();
    await expect(page.locator('output.contador')).toHaveText('2');
    expect(errors).toEqual([]);
  });
});

test.describe('when a component hydrates (criteria 11, 27)', () => {
  test('one with afterHydrate / onConnect runs them at load, with no interaction', async ({ page }) => {
    await open(page);
    // Nobody touched the page: the server instance's hooks are already in the record.
    expect(of(await lines(page), 'servidor')).toEqual(['beforeHydrate', 'afterHydrate', 'onConnect']);
  });

  test('one with only onDisconnect / onDispose waits for the gesture, and nothing of it ran before', async ({ page }) => {
    await open(page);
    expect(of(await lines(page), 'perezoso')).toEqual([]);
    await page.locator('ciclo-perezoso button.perezoso').click();
    await expect.poll(async () => of(await lines(page), 'perezoso')).toEqual(['despierto']);
    // The gesture that woke it is replayed: it counted.
    await expect(page.locator('ciclo-perezoso button.perezoso')).toContainText('(1)');
  });
});

test.describe('leaving the page (criteria 27, 28)', () => {
  test('to another page and back: restored from the bfcache, onDisconnect then onConnect, no onDispose, state intact', async ({ page }) => {
    await open(page);
    await page.locator('button.sumar').click();
    await expect(page.locator('output.contador')).toHaveText('1');
    await page.evaluate(() => {
      (window as unknown as { __kept: number }).__kept = 1;
      sessionStorage.removeItem('ciclo-dispose');
    });
    await page.locator('a.fuera').click();
    await page.waitForURL('**/about');
    // A page restored from the bfcache fires `pageshow`, not `load`.
    await page.goBack({ waitUntil: 'commit' });
    await page.waitForURL('**/ciclo', { waitUntil: 'commit' });

    // The same JavaScript heap: the page came back from the bfcache, it was not loaded again.
    expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept)).toBe(1);
    await expect.poll(async () => of(await lines(page), 'ruta')).toEqual(['afterHydrate', 'onConnect', 'onDisconnect', 'onConnect']);
    expect(await page.evaluate(() => sessionStorage.getItem('ciclo-dispose'))).toBeNull();
    await expect(page.locator('output.contador')).toHaveText('1');
  });

  test('to another page for good: onDispose runs (the page is not kept)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      sessionStorage.removeItem('ciclo-dispose');
      // An `unload` listener takes a page out of the bfcache in Chrome: this leave is final, and
      // pagehide arrives with persisted === false.
      addEventListener('unload', () => undefined);
    });
    await page.locator('a.fuera').click();
    await page.waitForURL('**/about');
    expect(await page.evaluate(() => sessionStorage.getItem('ciclo-dispose'))).not.toBeNull();
  });
});
