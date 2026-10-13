/**
 * `...item` in a browser — `/spread`, in the real build.
 *
 * `<spread-list>` hands each product to a `<spread-card ...producto .etiqueta="oferta">`. What
 * has to be visible is the whole of decisions 146–149 at once: every card shows the keys the
 * CARD declares; what the product carries beyond them (`sku`, `stock`) never reaches the page;
 * the product with no `precio` shows the card's default; the explicit `.etiqueta` wins. And a
 * click that changes every product's data — same keys, new objects — repaints every card,
 * which is the row renewal the keyed loop did not do before this.
 *
 * Twice over, as `/ref` and `/raw` are: hydrated from the server, and reached by a link.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const cards = (page: Page): Locator => page.locator('spread-list spread-card');
const field = (page: Page, i: number, cls: string): Locator => cards(page).nth(i).locator(`.${cls}`);

async function exercise(page: Page): Promise<void> {
  await expect(cards(page)).toHaveCount(3);
  const expected = [
    ['p1', 'Teclado', '49 €'],
    ['p2', 'Ratón', '19 €'],
    ['p3', 'Alfombrilla', '0 €'], // no `precio` in the product: the card's default
  ];
  for (const [i, [id, nombre, precio]] of expected.entries()) {
    await expect(field(page, i, 'id')).toHaveText(id!);
    await expect(field(page, i, 'nombre')).toHaveText(nombre!);
    await expect(field(page, i, 'precio')).toHaveText(precio!);
    await expect(field(page, i, 'etiqueta')).toHaveText('oferta'); // the explicit one wins
  }

  // What the products carry beyond the card's keys stays in the parent: no sku anywhere in the
  // document or its shadow roots, and no `stock` in what the cards paint or the state the page
  // serializes for them. (The page's own prose names `stock`, so the word is looked for there.)
  const { all, cards: painted } = await page.evaluate(() => {
    const shadows: string[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot !== null) {
          shadows.push(el.shadowRoot.innerHTML);
          walk(el.shadowRoot);
        }
      }
    };
    walk(document);
    const list = document.querySelector('spread-list')!.shadowRoot!;
    const cards = [...list.querySelectorAll('spread-card')].map((c) => c.shadowRoot!.innerHTML);
    const state = document.getElementById('fud-state')?.textContent ?? '';
    return { all: [document.documentElement.outerHTML, ...shadows].join('\n'), cards: [...cards, state].join('\n') };
  });
  for (const sku of ['K-01', 'M-07', 'P-22']) expect(all).not.toContain(sku);
  expect(painted).not.toContain('stock');

  // Every product becomes a new object with the same key: every card has to repaint.
  await page.locator('spread-list .subir').click();
  await expect(field(page, 0, 'precio')).toHaveText('59 €');
  await expect(field(page, 1, 'precio')).toHaveText('29 €');
  await expect(field(page, 2, 'precio')).toHaveText('10 €');
  for (let i = 0; i < 3; i++) await expect(field(page, i, 'etiqueta')).toHaveText('oferta');

  await page.locator('spread-list .subir').click();
  await expect(field(page, 2, 'precio')).toHaveText('20 €');
}

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test('hydrated from the server: the card´s keys only, defaults, and a repaint per row', async ({
  page,
}) => {
  const errors = errorsOf(page);
  await page.goto('/spread');
  await exercise(page);
  expect(errors).toEqual([]);
});

test('reached by a link: the same, on the load that follows a navigation', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/');
  await page.locator('site-nav a[href="/spread"]').click();
  await expect(page).toHaveURL(/\/spread$/u);
  await exercise(page);
  expect(errors).toEqual([]);
});
