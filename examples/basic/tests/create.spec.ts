/**
 * SDD-85 — what the browser creates, it creates by cloning a template (criteria 6, 10, 11, 16, 17).
 *
 * Every block that opens after the page loaded builds its nodes from a parsed template instead of
 * one call per node. What is measured is that nothing a user can see tells the two apart: rows
 * that are born, move and go keep their own state; a component in a branch arrives alive; a form
 * born in an `@if` validates and sends; a block inside `<svg>` or `<math>` creates nodes of its
 * own namespace. And all of it under the strict policy of `page.headers`, with the `fudic` policy
 * created only when a template is first cloned.
 *
 * It runs in `preview` (with a Service Worker) and in `nosw`.
 */

import { test, expect, type Locator, type Page } from '@playwright/test';

/** Every console error and uncaught exception the page reports from now on. */
function errors(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') seen.push(message.text());
  });
  page.on('pageerror', (error) => seen.push(error.message));
  return seen;
}

const rows = (page: Page): Locator => page.locator('vivo-lista vivo-item');
const labels = (page: Page): Locator => rows(page).locator('[data-id="label"]');
const counts = (page: Page): Locator => rows(page).locator('[data-id="count"]');
const list = (page: Page, id: string): Locator => page.locator(`vivo-lista [data-id="${id}"]`);

test.describe('/vivo — rows born, moved and removed (criterion 10)', () => {
  test('a keyed row keeps its own count across two reverses and a removal', async ({ page }) => {
    const seen = errors(page);
    await page.goto('/vivo');

    for (let i = 0; i < 3; i++) await list(page, 'add').click();
    await expect(labels(page)).toHaveText([
      'pintado por el servidor',
      'creado al vuelo 1',
      'creado al vuelo 2',
      'creado al vuelo 3',
    ]);
    // A different number of clicks per row, so a row rebuilt in place would show.
    for (let i = 0; i < 4; i++) {
      for (let n = 0; n <= i; n++) await counts(page).nth(i).click();
    }
    const before = ['tocado 1 veces', 'tocado 2 veces', 'tocado 3 veces', 'tocado 4 veces'];
    await expect(counts(page)).toHaveText(before);

    await list(page, 'reverse').click();
    await expect(labels(page)).toHaveText([
      'creado al vuelo 3',
      'creado al vuelo 2',
      'creado al vuelo 1',
      'pintado por el servidor',
    ]);
    await expect(counts(page)).toHaveText([...before].reverse());

    await list(page, 'reverse').click();
    await expect(counts(page)).toHaveText(before);

    await list(page, 'remove-first').click();
    await expect(labels(page)).toHaveText(['creado al vuelo 1', 'creado al vuelo 2', 'creado al vuelo 3']);
    await expect(counts(page)).toHaveText(before.slice(1));
    expect(seen).toEqual([]);
  });

  test('the component of each branch arrives alive, back and forth', async ({ page }) => {
    const seen = errors(page);
    await page.goto('/vivo');
    const toggle = page.locator('[data-id="alternar"]');

    for (const tag of ['vivo-otro', 'vivo-item', 'vivo-otro', 'vivo-item']) {
      await toggle.click();
      const host = page.locator(`main > ${tag}`);
      await expect(host).toHaveCount(1);
      await host.locator('[data-id="count"]').click();
      await expect(host.locator('[data-id="count"]')).toHaveText('tocado 1 veces');
    }
    expect(seen).toEqual([]);
  });
});

test.describe('the other keyed loops, with no error', () => {
  test('/spread renews every card with new objects under the same keys', async ({ page }) => {
    const seen = errors(page);
    await page.goto('/spread');
    const cards = page.locator('spread-list spread-card');
    await expect(cards).toHaveCount(3);
    await page.locator('spread-list .subir').click();
    await expect(cards.nth(0).locator('.precio')).toHaveText('59 €');
    await expect(cards.nth(2).locator('.precio')).toHaveText('10 €');
    expect(seen).toEqual([]);
  });

  test('/mapas: a click on a delegated option raises its owner, and the log hears it (decision 43)', async ({ page }) => {
    const seen = errors(page);
    await page.goto('/mapas');
    const options = page.locator('bus-picker bus-option button');
    // The first click lands on a cold page: its `pointerdown` raises the owner that listens around
    // the option, and the click behind it waits in the owner's queue — replayed before the owner
    // is up, it was heard by nobody.
    await options.nth(1).click();
    await expect(page.locator('bus-log .log strong')).toHaveText('Routing por fichero');
    // And the next one is heard by the owner already up.
    await options.nth(2).click();
    await expect(page.locator('bus-log .log strong')).toHaveText('SSG estático e incremental');
    expect(seen).toEqual([]);
  });

});

test.describe('/vivo — a form born in an `@if` (criterion 11)', () => {
  const form = (page: Page): Locator => page.locator('main > app-form');
  const input = (page: Page, id: string): Locator => form(page).locator(`input#${id}`);
  const control = (page: Page, host: string): Locator => form(page).locator(`#${host} input`);
  async function enter(target: Locator, text: string): Promise<void> {
    await target.fill(text);
    await target.blur();
  }

  test('it validates, shows its errors, and sends', async ({ page }) => {
    const seen = errors(page);
    await page.goto('/vivo');
    await expect(form(page)).toHaveCount(0);
    await page.locator('[data-id="abrir-formulario"]').click();
    await expect(form(page)).toHaveCount(1);
    const send = form(page).locator('button[type="submit"]');

    await enter(control(page, 'email'), 'pedro@');
    await expect(form(page).locator('#fud-e-userForm-email')).toHaveText('Ese email no parece válido.');
    await enter(input(page, 'cla'), 'abcdefgh');
    await enter(input(page, 'rep'), 'abcdefgx');
    await expect(form(page).locator('#fud-s-userForm-acceso ul > li')).toHaveText([
      'Las contraseñas no coinciden.',
    ]);
    await expect(send).toBeDisabled();

    await enter(input(page, 'nom'), 'Ada');
    await enter(control(page, 'ali'), 'lovelace');
    await enter(control(page, 'email'), 'ada@example.com');
    await enter(input(page, 'cla'), 'analitica');
    await enter(input(page, 'rep'), 'analitica');
    await expect(send).toBeEnabled();
    await send.click();
    await expect(form(page).locator('[data-id="enviado"]')).toHaveText('Enviado: Ada.');

    // Closed and opened again: a new element, bound to the same form — its model is declared by
    // the page's `.fudapi`, not by the element — and validating again.
    await page.locator('[data-id="abrir-formulario"]').click();
    await expect(form(page)).toHaveCount(0);
    await page.locator('[data-id="abrir-formulario"]').click();
    await expect(input(page, 'nom')).toHaveValue('Ada');
    await enter(control(page, 'email'), 'x');
    await expect(form(page).locator('#fud-e-userForm-email')).toHaveText('Ese email no parece válido.');
    expect(seen).toEqual([]);
  });
});

test.describe('/vivo — blocks inside `<svg>` and `<math>` (criterion 6)', () => {
  test('what the browser creates there is born SVG and MathML', async ({ page }) => {
    const seen = errors(page);
    await page.goto('/vivo');
    const panel = page.locator('vivo-figuras');
    const report = panel.locator('[data-id="informe"]');

    await panel.locator('[data-id="figura"]').click();
    await panel.locator('[data-id="formula"]').click();
    await panel.locator('[data-id="comprobar"]').click();
    await expect(report).toHaveText(
      'figura: <rect> http://www.w3.org/2000/svg · fórmula: <msqrt> http://www.w3.org/1998/Math/MathML',
    );
    // The `<mi>` inside the created `<msqrt>` is MathML too: the wrapper is gone, the namespace stays.
    expect(
      await panel.locator('[data-id="math"] msqrt mi').evaluate((el) => el.namespaceURI),
    ).toBe('http://www.w3.org/1998/Math/MathML');

    await panel.locator('[data-id="figura"]').click();
    await panel.locator('[data-id="formula"]').click();
    await panel.locator('[data-id="comprobar"]').click();
    await expect(report).toHaveText(
      'figura: <circle> http://www.w3.org/2000/svg · fórmula: <msup> http://www.w3.org/1998/Math/MathML',
    );
    // And it is drawn: a rendered SVG shape has a box, an HTML element called `circle` has none.
    const box = await panel.locator('[data-id="svg"] circle').boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(seen).toEqual([]);
  });
});

test.describe('Trusted Types (criteria 16 and 17)', () => {
  test('creating under the strict policy of page.headers: zero violations', async ({ page }) => {
    const seen = errors(page);
    await page.goto('/vivo');
    await list(page, 'add').click();
    await page.locator('[data-id="alternar"]').click();
    await page.locator('[data-id="abrir-formulario"]').click();
    await page.locator('vivo-figuras [data-id="figura"]').click();
    await page.locator('vivo-figuras [data-id="formula"]').click();
    await expect(labels(page)).toHaveCount(2);
    await expect(page.locator('main > app-form')).toHaveCount(1);
    await expect(page.locator('vivo-figuras [data-id="svg"] rect')).toHaveCount(1);
    await page.goto('/clases');
    await page.locator('[data-id="abrir"]').click();
    await expect(page.locator('main > clases-demo')).toHaveCount(2);
    expect(seen).toEqual([]);
  });

  test('the policy is created by the first clone, not before', async ({ page }, info) => {
    // With a worker, registering it already asks for the policy: only the build without one can
    // tell "a page that creates nothing" from "a page that will".
    test.skip(info.project.name !== 'nosw', 'the Service Worker registration creates the policy');
    // Chrome has no `getPolicyNames()`: the names are recorded as `createPolicy` is called.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __policies: string[];
        trustedTypes: { createPolicy(name: string, rules: object): unknown };
      };
      w.__policies = [];
      const create = w.trustedTypes.createPolicy.bind(w.trustedTypes);
      w.trustedTypes.createPolicy = (name, rules) => {
        w.__policies.push(name);
        return create(name, rules);
      };
    });
    const policies = (): Promise<string[]> =>
      page.evaluate(() => (window as unknown as { __policies: string[] }).__policies);

    await page.goto('/about');
    await page.waitForLoadState('networkidle');
    expect(await policies()).not.toContain('fudic');

    await page.goto('/vivo');
    await page.waitForLoadState('networkidle');
    expect(await policies()).not.toContain('fudic');

    await list(page, 'add').click();
    await expect(labels(page)).toHaveCount(2);
    expect(await policies()).toContain('fudic');
  });
});
