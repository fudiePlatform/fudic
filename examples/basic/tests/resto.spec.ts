/**
 * The rest of `props<T>()` in a browser — `/resto`, in the real build.
 *
 * `<campo-texto>` names `label` and gathers everything else of its `T` into `resto`; its echo
 * line prints what the rest holds. The server paints it from the destructuring as written; the
 * client rebuilds `resto` from the slot of each key. A click in `<resto-demo>` changes two of
 * the gathered keys and leaves the third alone — so the echo has to move in those two places
 * and nowhere else, and the named `label` must not be disturbed.
 *
 * Twice over, as the other pages of this tanda: hydrated from the server, and reached by a link.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const campo = (page: Page): Locator => page.locator('resto-demo campo-texto');
const eco = (page: Page): Locator => campo(page).locator('.eco');
const input = (page: Page): Locator => campo(page).locator('input');

async function exercise(page: Page): Promise<void> {
  // What the server painted out of `...resto`.
  await expect(eco(page)).toHaveText('placeholder: Escribe tu nombre · required: true · maxlength: 20');
  await expect(input(page)).toHaveAttribute('placeholder', 'Escribe tu nombre');
  await expect(campo(page).locator('.campo > span')).toHaveText('Nombre');

  const cambiar = page.locator('resto-demo .cambiar');
  await cambiar.click();
  await expect(eco(page)).toHaveText('placeholder: ¿Cómo te llamas? · required: false · maxlength: 20');
  await expect(input(page)).toHaveAttribute('placeholder', '¿Cómo te llamas?');
  await expect(campo(page).locator('.campo > span')).toHaveText('Nombre');

  await cambiar.click();
  await expect(eco(page)).toHaveText('placeholder: Escribe tu nombre · required: true · maxlength: 20');
  await expect(input(page)).toHaveAttribute('placeholder', 'Escribe tu nombre');
}

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('hydrated from the server: the rest painted, then rebuilt on every change', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/resto');
  await exercise(page);
  expect(errors).toEqual([]);
});

test('reached by a link: the same, on the load that follows a navigation', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/');
  await page.locator('site-nav a[href="/resto"]').click();
  await expect(page).toHaveURL(/\/resto$/u);
  await exercise(page);
  expect(errors).toEqual([]);
});
