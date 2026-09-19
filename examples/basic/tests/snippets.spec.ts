/**
 * SDD-29 in a browser — `/snippets`, in the real build.
 *
 * The compiler's own suites read the text it produces. This one reads what Chrome BUILT
 * from that text, which is the only place the claim of §1 can actually be checked: after
 * the expansion the page is indistinguishable from the same markup written by hand. A
 * snippet has no host, no shadow root, no identity and nothing at runtime — so there is
 * nothing here to look for that would prove one exists. What is asserted instead is that
 * everything a snippet CONTRIBUTED is present, and that the snippet itself is not.
 *
 * The page is static: no `load`, no reactive, nothing to hydrate. It is prerendered at
 * build time, so what Chrome parses is the file on disk.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/snippets');
});

test('the markup a snippet declares is in the document, and the snippet is not', async ({
  page,
}) => {
  // Declared in the route itself, invoked before it is declared (position is free).
  const fila = page.locator('p.fila[data-clave="local"]');
  await expect(fila).toHaveText(/local\s+el snippet vive en esta misma ruta/u);

  // Nothing of the construct survives: no element, no attribute, no text of its own.
  const html = await page.content();
  expect(html).not.toContain('@render');
  expect(html).not.toContain('@snippet');
  expect(html).not.toContain('rel="snippet"');
});

test('a file imported with no `as` lends its snippets by name, defaults included', async ({
  page,
}) => {
  const fichas = page.locator('main > article.ficha');
  await expect(fichas).toHaveCount(3);
  await expect(fichas.nth(0).locator('h3')).toHaveText('Primera');
  await expect(fichas.nth(1).locator('h3')).toHaveText('Segunda');
  // The third call passes no `tono`, so the default of the signature is what renders.
  await expect(fichas.nth(2).locator('app-badge')).toHaveText('neutral');
});

test('a file imported with `as` lends the same name under a namespace (criterion 17)', async ({
  page,
}) => {
  // `ficha` exists in BOTH files. Without the namespace they would collide; with it, the
  // page renders one of each and they are different markup.
  const campos = page.locator('form.campos label.campo');
  await expect(campos).toHaveCount(2);
  await expect(campos.nth(0).locator('input')).toHaveAttribute('name', 'correo');
  await expect(campos.nth(1).locator('span')).toHaveText('Ciudad');
  await expect(page.locator('form.campos small.pie')).toBeVisible();
});

test('the component a snippet instantiates works, though the page never declared it', async ({
  page,
}) => {
  // Criterion 21: `app-badge` is declared by `ui.fud`, and the call is what drags it here.
  // "Works" for a component means its shadow root is real and its CSS applies, so the
  // assertion is a computed style — the one thing an undefined element could not produce.
  const badge = page.locator('article.ficha').first().locator('app-badge');
  await expect(badge).toBeVisible();
  const border = await badge.evaluate(
    (el) => getComputedStyle(el.shadowRoot!.querySelector('.badge')!).borderColor,
  );
  // `.badge.success`, from the stylesheet `app-badge` adopts: the tone reached the shadow.
  expect(border).toBe('rgb(52, 168, 83)');
});

test('the component of the snippet nobody called is nowhere on the page (criterion 23)', async ({
  page,
}) => {
  // `ui.fud` declares `sin-css` for its `nota` snippet, which this page never renders.
  await expect(page.locator('sin-css')).toHaveCount(0);
  expect(await page.content()).not.toContain('sin-css');
});

test('the page stays zero-JS: a snippet adds nothing at runtime', async ({ page }) => {
  // §1: a snippet does not exist in the browser. Nothing here defines a custom element,
  // and the two tags on the page are painted by the parser from their declarative shadow
  // roots alone.
  const defined = await page.evaluate(() =>
    ['app-badge', 'site-nav'].map((tag) => customElements.get(tag) !== undefined),
  );
  expect(defined).toEqual([false, false]);

  // Not one hydration chunk was fetched: `/assets/h/<tag>.js` is what a page with something
  // to hydrate asks for, and this page asks for none.
  const hydrationChunks = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => url.includes('/assets/h/')),
  );
  expect(hydrationChunks).toEqual([]);

  // And the shadow root is there all the same: the parser built it from the markup.
  const shadowed = await page.evaluate(
    () => document.querySelector('app-badge')!.shadowRoot !== null,
  );
  expect(shadowed).toBe(true);
});
