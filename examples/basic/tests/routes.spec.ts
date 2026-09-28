/**
 * Every route of the example renders, in every shape the framework has.
 *
 * There was no test at this altitude, and it is the one that would have caught the two bugs
 * this file was written for. Both were invisible to `pnpm build`:
 *
 *  - `/blog` and `/mapas` threw `HTMLElement is not defined` on the DEV server. They import
 *    `strategy` from `@fudic/core` inside `@server`, and that entry point defined the custom
 *    element base class as a side effect of being imported. A production build tree-shakes
 *    the class away before Node sees it; the dev server evaluates the module whole.
 *  - `/signal-prop` failed to prerender, and the build reported it as a WARNING. The route
 *    simply did not exist in `dist/` and everything stayed green.
 *
 * So the assertions are deliberately shallow — a heading, and no error overlay. What is
 * under test is that the page EXISTS and rendered, which is the property that was silently
 * false for months.
 */
import { expect, test, type Page } from '@playwright/test';

/** Every route of the manifest, with a real slug standing in for the dynamic one. */
const ROUTES = [
  '/',
  '/about',
  '/blog',
  '/mapas',
  '/value-prop',
  '/signal-prop',
  '/hidratacion',
  '/formularios',
  '/delegacion',
  '/reactividad',
] as const;

/**
 * What the dev server shows when a module fails: an overlay element in the top-level DOM.
 * In a build there is no overlay, and a failed prerender is a 404 instead — which is why
 * the response status is checked as well.
 */
const overlayText = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.querySelector('vite-error-overlay')?.textContent ?? null);

for (const route of ROUTES) {
  test(`${route} renders`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const response = await page.goto(route);
    expect(response?.status(), `${route} did not respond`).toBeLessThan(400);

    expect(await overlayText(page), `${route} failed to render on the server`).toBeNull();
    await expect(page.locator('h1')).toBeVisible();
    expect(errors, `${route} threw in the browser`).toEqual([]);
  });
}

test('/blog/:slug renders a post', async ({ page }) => {
  const response = await page.goto('/blog/dsd-sin-framework');
  expect(response?.status()).toBeLessThan(400);
  expect(await overlayText(page)).toBeNull();
  await expect(page.locator('h1')).toBeVisible();
});

// BUG-44: the layout's prop is a binding of its head, and what differs from route to route in
// the body is the route's to write. So `seccion` reaches a `<meta>` interpolated — it used to
// go out as the text `@seccion` — and the breadcrumb is the route's own `@section nav`,
// rendered where the layout left the hole, outside the `<main>` the route's body goes into.
test('/blog/:slug puts the layout prop in the head and the breadcrumb in its section', async ({
  page,
}) => {
  await page.goto('/blog/dsd-sin-framework');
  await expect(page.locator('meta[property="article:section"]')).toHaveAttribute('content', 'Blog');
  await expect(page.locator('p.miga')).toBeVisible();
  await expect(page.locator('main p.miga')).toHaveCount(0);
});
