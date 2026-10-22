/**
 * `ref="@variable"` in a browser — `/ref`, in the real build.
 *
 * The compiler's suites check that the write lands in the hookup and runs on both paths of
 * a factory. This one checks what the author actually relies on: the `let` they declared in
 * its `@code` holds the live node when their own code reads it, and goes back to `null` when
 * the node leaves. `<ref-demo>` reports what it reads into `.informe`, so every assertion is
 * on text the component wrote with its own hands.
 *
 * Twice over: once on a page the server painted and the first gesture hydrates, and once on
 * the same page reached by following a link — the second load is the one the Service Worker
 * answers, and a ref that only worked on the first would be a ref that works by accident.
 *
 * Hydration is driven by the gesture (SDD-17): the first click wakes the component and is
 * replayed, so there is no "wait until hydrated" step — `expect` retries until it lands.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const demo = (page: Page): Locator => page.locator('ref-demo');
const informe = (page: Page): Locator => demo(page).locator('.informe');

/** The element that holds focus, through the shadow root that owns it. */
const focused = (page: Page): Promise<string | null> =>
  demo(page).evaluate((host) => {
    const active = host.shadowRoot!.activeElement;
    return active === null ? null : active.localName;
  });

async function exercise(page: Page): Promise<void> {
  // Nothing has run yet: the server painted the initial report and no aviso.
  await expect(informe(page)).toHaveText('Aún no has pulsado nada.');
  await expect(demo(page).locator('.aviso')).toHaveCount(0);

  // `campo` lives always: the hookup gave it the input the server painted.
  await demo(page).locator('.enfocar').click();
  await expect(informe(page)).toHaveText('campo es un <input> con "hola"');
  expect(await focused(page)).toBe('input');

  // `aviso` lives only while the @if paints it.
  await demo(page).locator('.medir').click();
  await expect(informe(page)).toHaveText('aviso es null');

  await demo(page).locator('.alternar').click();
  await expect(demo(page).locator('.aviso')).toHaveText('Soy el aviso del @if');
  await demo(page).locator('.medir').click();
  await expect(informe(page)).toHaveText('aviso es un <p>: "Soy el aviso del @if"');

  // The branch leaves, and its teardown hands the variable back to null.
  await demo(page).locator('.alternar').click();
  await expect(demo(page).locator('.aviso')).toHaveCount(0);
  await demo(page).locator('.medir').click();
  await expect(informe(page)).toHaveText('aviso es null');

  // And a second turn of the branch writes the NEW node, not the retired one.
  await demo(page).locator('.alternar').click();
  await demo(page).locator('.medir').click();
  await expect(informe(page)).toHaveText('aviso es un <p>: "Soy el aviso del @if"');
}

/** Uncaught errors, collected: a ref that threw would leave the report unchanged, silently. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('hydrated from the server: the variables hold the nodes, and null once they leave', async ({
  page,
}) => {
  const errors = errorsOf(page);
  await page.goto('/ref');
  // The attribute is the compiler's, not the DOM's: nothing of it reaches the markup.
  expect(await demo(page).evaluate((host) => host.shadowRoot!.querySelector('[ref]'))).toBeNull();
  await exercise(page);
  expect(errors).toEqual([]);
});

test('reached by a link: the same, on the load that follows a navigation', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/');
  await page.locator('site-nav a[href="/ref"]').click();
  await expect(page).toHaveURL(/\/ref$/u);
  await exercise(page);
  expect(errors).toEqual([]);
});
