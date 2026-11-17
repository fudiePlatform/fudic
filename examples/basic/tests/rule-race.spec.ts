/**
 * BUG-62 — a form used before the browser root registered its rules.
 *
 * `app-form` wakes up as soon as it is needed, but the implementations of its rules arrive
 * after, through the browser root, which loads them with dynamic imports one file after another.
 * Nothing waited for that: a rule checked in the window found its slot empty and threw, the field
 * kept no message, and the submit of an empty form went through as valid. Here the rules arrive
 * three seconds late, which opens the window wide enough to land in it every time: both tests fail
 * without the fix.
 */

import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __woken: boolean;
  }
}

// What the Service Worker fetches never reaches `page.route`: without it, every module is the page's.
test.use({ serviceWorkers: 'block' });

/** `/formularios` with its rules three seconds late, once `app-form` is awake; the page errors, collected. */
async function openEarly(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The validators the implementations of the rules are written with: `app-form` does not need
  // them to wake up, so it is live long before its rules are.
  await page.route(/\/_fudic\/[^/]+\/forms\/validators\.js$/u, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__woken = false;
    document.addEventListener('fud:hydrated', (e) => {
      if ((e as CustomEvent<{ tag: string }>).detail.tag === 'app-form') window.__woken = true;
    });
  });
  await page.goto('/formularios');
  await page.waitForFunction(() => window.__woken, null, { timeout: 15_000 });
  return errors;
}

const errorOf = (page: Page, path: string) => page.locator(`app-form #fud-e-userForm-${path}`);

test('a field left before its rules arrived still says what is wrong', async ({ page }) => {
  const errors = await openEarly(page);
  const alias = page.locator('app-form #ali input');
  await alias.fill('ad');
  await alias.blur();

  await expect(errorOf(page, 'alias')).toHaveText('El alias necesita al menos 3 caracteres.', { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('an empty form submitted before its rules arrived is not sent', async ({ page }) => {
  const errors = await openEarly(page);
  await page.locator('app-form button[type="submit"]').click();

  await expect(errorOf(page, 'name')).toHaveText('Escribe tu nombre.', { timeout: 15_000 });
  await expect(page.locator('app-form .enviado')).toHaveCount(0);
  expect(errors).toEqual([]);
});
