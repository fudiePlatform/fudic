/**
 * SDD-85 — a dynamic class touches its own tokens and nothing else (criteria 20–23 and 26).
 *
 * `/clases` carries `<clases-demo>` twice: one the server paints and the browser hydrates, one the
 * browser creates when an `@if` opens. Each has three boxes — `class:activo`, `class=@expr` and the
 * `class` of a spread — and a button that adds `extra` to all three through a `ref`, the way a
 * library or an animation would. `extra` has to survive every change, in both panels.
 *
 * It runs in `preview` (with a Service Worker) and in `nosw`.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

const panels = (page: Page): Locator => page.locator('main > clases-demo');

/** The classes of one box, as a sorted set: the order of the tokens may change (decision 11). */
const tokens = (panel: Locator, box: number): Promise<string[]> =>
  panel
    .locator(`[data-id="caja${box}"]`)
    .evaluate((el) => [...el.classList].sort());

async function exercise(panel: Locator): Promise<void> {
  const click = (id: string) => panel.locator(`[data-id="${id}"]`).click();

  // Criterion 23: the author wrote `activo` fixed, but `class:activo` rules and starts false.
  expect(await tokens(panel, 1)).toEqual(['caja', 'card']);
  expect(await tokens(panel, 2)).toEqual(['a', 'b']);
  expect(await tokens(panel, 3)).toEqual(['x', 'y']);

  await click('extra');
  await expect.poll(() => tokens(panel, 1)).toEqual(['caja', 'card', 'extra']);

  // Criterion 20: `class:` puts and takes its token, and only its token.
  for (const on of [true, false, true]) {
    await click('activo');
    await expect
      .poll(() => tokens(panel, 1))
      .toEqual(on ? ['activo', 'caja', 'card', 'extra'] : ['caja', 'card', 'extra']);
  }

  // Criterion 21: `class=@expr` from 'a b' to 'b c' takes `a`, puts `c`, and leaves `extra`.
  for (const next of [['b', 'c'], ['a', 'b'], ['b', 'c']]) {
    await click('clase');
    await expect.poll(() => tokens(panel, 2)).toEqual([...next, 'extra'].sort());
  }

  // Criterion 22: the `class` of a spread, on an element with no class of its own.
  for (const next of [['y', 'z'], ['x', 'y'], ['y', 'z']]) {
    await click('resto');
    await expect.poll(() => tokens(panel, 3)).toEqual([...next, 'extra'].sort());
  }
  // The rest of the spread is still written as an attribute.
  await expect(panel.locator('[data-id="caja3"]')).toHaveAttribute('title', 'con spread');
}

test.describe('/clases — classes nobody declared survive', () => {
  test('in the panel the server painted', async ({ page }) => {
    await page.goto('/clases');
    await expect(panels(page)).toHaveCount(1);
    await exercise(panels(page).first());
  });

  test('in the panel the browser created', async ({ page }) => {
    await page.goto('/clases');
    await page.locator('[data-id="abrir"]').click();
    await expect(panels(page)).toHaveCount(2);
    await exercise(panels(page).nth(1));
  });

  test('hydrating writes no class until the first change (criterion 26)', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __classWrites: string[] };
      w.__classWrites = [];
      document.addEventListener('DOMContentLoaded', () => {
        const root = document.querySelector('clases-demo')!.shadowRoot!;
        new MutationObserver((records) => {
          for (const r of records) w.__classWrites.push((r.target as Element).getAttribute('data-id') ?? '?');
        }).observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
      });
    });
    await page.goto('/clases');
    const panel = panels(page).first();

    // A click that brings the component up and only reads.
    await panel.locator('[data-id="leer"]').click();
    await expect(panel.locator('[data-id="informe"]')).toHaveText('1: "caja card" · 2: "a b" · 3: "x y"');
    const writes = (): Promise<string[]> =>
      page.evaluate(() => (window as unknown as { __classWrites: string[] }).__classWrites);
    expect(await writes()).toEqual([]);

    // The first change writes, and only on its own box.
    await panel.locator('[data-id="activo"]').click();
    await expect.poll(writes).toEqual(['caja1']);
  });
});
