/**
 * A component that first exists in the browser.
 *
 * Every instance the runtime knows how to raise came painted by the server: it carries a
 * `data-fud-id`, the page map names its tag and the cascade hands it its slice. An instance
 * created at runtime inside a `@foreach` has none of that — nothing painted it — and the
 * parent that fabricated it is the only one who can bring it to life.
 *
 * What is measured is that the two paths end in the same place: the element the server
 * painted and the one the click created are equally alive.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

const items = (page: Page): Locator => page.locator('vivo-lista vivo-item');
const labels = (page: Page): Locator => page.locator('vivo-lista vivo-item [data-id="label"]');

test.describe('/vivo — a component nobody painted', () => {
  test('the one the server painted is alive', async ({ page }) => {
    await page.goto('/vivo');

    await expect(labels(page)).toHaveText(['pintado por el servidor']);
    // Its own state responds, which is what tells an instance apart from static markup.
    await page.locator('vivo-item [data-id="count"]').click();
    await expect(page.locator('vivo-item [data-id="count"]')).toHaveText('tocado 1 veces');
  });

  test('the one the click created is alive too', async ({ page }) => {
    await page.goto('/vivo');
    await page.locator('vivo-lista [data-id="add"]').click();

    await expect(items(page)).toHaveCount(2);
    // It renders its own template, from the prop the parent handed it.
    await expect(labels(page)).toHaveText(['pintado por el servidor', 'creado al vuelo 1']);

    // And it has its own state, independent of the one that came from the server.
    await items(page).nth(1).locator('[data-id="count"]').click();
    await expect(items(page).nth(1).locator('[data-id="count"]')).toHaveText('tocado 1 veces');
    await expect(items(page).nth(0).locator('[data-id="count"]')).toHaveText('tocado 0 veces');
  });

  test('a second one is created with no further download', async ({ page }) => {
    await page.goto('/vivo');
    await page.locator('vivo-lista [data-id="add"]').click();
    await expect(items(page)).toHaveCount(2);

    const asked: string[] = [];
    page.on('request', (r) => {
      if (/vivo-item/u.test(r.url())) asked.push(r.url());
    });
    await page.locator('vivo-lista [data-id="add"]').click();

    await expect(labels(page)).toHaveText([
      'pintado por el servidor',
      'creado al vuelo 1',
      'creado al vuelo 2',
    ]);
    // The definition is per TAG and memoized: the second instance downloads nothing.
    expect(asked).toEqual([]);
  });
});
