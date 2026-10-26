/**
 * `@raw(expr)` in a browser — `/raw`, in the real build.
 *
 * What Chrome parsed out of the response is the server half; what a click repaints is the
 * client half; and they have to be the same tree. `<raw-demo>` holds the two cases that
 * tell them apart: a trusted post that becomes elements, and a signal that swaps it for another.
 *
 * The `+1` below the post is the hydration check: `h` adopts each `@raw` element without
 * entering it, so if it miscounted, the button after them would be wired to nothing.
 *
 * Twice over, as `/ref` is: hydrated from the server, and reached by a link.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const demo = (page: Page): Locator => page.locator('raw-demo');
const post = (page: Page): Locator => demo(page).locator('.post');

async function exercise(page: Page): Promise<void> {
  // The first post, as elements: the HTML reached the DOM as markup.
  await expect(post(page).locator('h3')).toHaveText('Primer post');
  await expect(post(page).locator('em')).toHaveText('énfasis');
  await expect(post(page).locator('a')).toHaveAttribute('href', '/');


  // The signal swaps the content, and only the content: the article is the same element.
  const article = await post(page).elementHandle();
  await demo(page).locator('.cambiar').click();
  await expect(post(page).locator('h3')).toHaveText('Segundo post');
  await expect(post(page).locator('ul > li')).toHaveCount(2);
  await expect(post(page).locator('em')).toHaveCount(0);
  expect(await post(page).evaluate((el, before) => el === before, article)).toBe(true);

  await demo(page).locator('.cambiar').click();
  await expect(post(page).locator('h3')).toHaveText('Primer post');
  await expect(post(page).locator('ul')).toHaveCount(0);

  // What comes after the @raw elements is still wired: the walk did not lose count.
  await demo(page).locator('.sumar').click();
  await expect(demo(page).locator('.clics')).toHaveText('1');
  await demo(page).locator('.sumar').click();
  await expect(demo(page).locator('.clics')).toHaveText('2');
}

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('hydrated from the server: markup as markup, and the rest alive', async ({
  page,
}) => {
  const errors = errorsOf(page);
  await page.goto('/raw');
  await exercise(page);
  expect(errors).toEqual([]);
});

test('reached by a link: the same, on the load that follows a navigation', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/');
  await page.locator('site-nav a[href="/raw"]').click();
  await expect(page).toHaveURL(/\/raw$/u);
  await exercise(page);
  expect(errors).toEqual([]);
});
