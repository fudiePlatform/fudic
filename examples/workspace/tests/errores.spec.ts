/**
 * The error page a library shares, and an app under a base that stays in it (SDD-87 criterion 1).
 *
 * `admin` has no `_error.fud`: it paints with the one of `libs/ui`, its chain's. Published under
 * `/admin/`, everything the browser does for it stays there: its calls, its token, its remote
 * rule, its error page and the routes of `error-pages`. `tienda` depends on `ui` too, and paints
 * with its own page: the app's own wins.
 *
 * Each app is served by its own `vite preview` (see `playwright.config.ts`); every path the
 * browser asks is recorded, so where a call went is read, not assumed.
 */

import { test, expect, type Page } from '@playwright/test';
/** The two `vite preview` servers of `playwright.config.ts`. */
const ADMIN = 'http://localhost:4374';
const TIENDA = 'http://localhost:4375';

/** Every path the page asks for, from now on. */
function asked(page: Page): string[] {
  const paths: string[] = [];
  page.on('request', (request) => paths.push(new URL(request.url()).pathname));
  return paths;
}

/** The page of `ui`: its status in `.codigo`, and its link home. */
async function expectUiPage(page: Page, status: number): Promise<void> {
  await expect(page.locator('[data-error-page="ui"]')).toBeVisible();
  await expect(page.locator('.codigo')).toHaveText(String(status));
  await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible();
}

/**
 * What the layout puts in every document it paints (SDD-88 §4.3): `<html lang="es">`, its
 * viewport, the runtime (its marker becomes the boot script, under the app's base) and the
 * `<main>` the route's body goes in. Read off the page as the browser has it.
 */
async function layoutOf(page: Page): Promise<{ lang: string; viewport: number; boot: string[]; main: number }> {
  return page.evaluate(() => ({
    lang: document.documentElement.lang,
    viewport: document.head.querySelectorAll('meta[name="viewport"]').length,
    boot: [...document.head.querySelectorAll<HTMLScriptElement>('script[src*="fudic-boot-"]')].map((s) => new URL(s.src).pathname.replace(/-[0-9a-f]+\.js$/u, '.js')),
    main: document.querySelectorAll('body > main').length,
  }));
}

/** /admin/fallos, its buttons and its form live: the client ran. */
async function fallos(page: Page): Promise<void> {
  await page.goto(`${ADMIN}/admin/fallos`);
  await expect(page.locator('h1')).toHaveText('Fallos');
  await page.waitForLoadState('networkidle');
}

test.describe('admin: the page of ui, under /admin/', () => {
  test('/admin/no-existe is a 404 painted with the page of ui, and its home is /admin/', async ({ page }) => {
    const response = await page.goto(`${ADMIN}/admin/no-existe`);
    expect(response?.status()).toBe(404);
    await expectUiPage(page, 404);
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/admin/');
    await page.getByRole('link', { name: 'Ir al inicio' }).click();
    await expect(page).toHaveURL(`${ADMIN}/admin/`);
  });

  test('the button that answers paints what it returns: the call went to /admin/_fudic/fn/…', async ({ page }) => {
    await fallos(page);
    const paths = asked(page);
    await page.locator('#saludo').click();
    await expect(page.locator('#respuesta')).toHaveText('Hola desde /admin/');
    expect(paths.filter((p) => p.includes('/_fudic/fn/'))).toEqual(['/admin/_fudic/fn/routes/fallos/saludo']);
  });

  test('the 500 goes to /admin/_fudic/error/500, the page of ui, with a way back to /admin/fallos', async ({ page }) => {
    await fallos(page);
    const paths = asked(page);
    await page.locator('#rompe').click();
    await expect(page).toHaveURL(`${ADMIN}/admin/_fudic/error/500`);
    await expectUiPage(page, 500);
    await expect(page.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/admin/fallos');
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/admin/');
    // The call, and every /_fudic/ the browser asked after it, under /admin/ — except the pieces
    // of the published runtime (`/_fudic/<version>/…`), which carry no base on purpose (SDD-45
    // §4.2): one copy on the origin for every app. The error page loads them since it has a
    // layout, and with it the runtime (SDD-88).
    expect(paths).toContain('/admin/_fudic/fn/routes/fallos/rompe');
    const runtimePiece = /^\/_fudic\/\d+\.\d+\.\d+-[0-9a-f]+\//u;
    expect(paths.filter((p) => p.includes('/_fudic/') && !p.startsWith('/admin/') && !runtimePiece.test(p))).toEqual([]);
  });

  test('the 403 goes to /admin/entrar', async ({ page }) => {
    await fallos(page);
    await page.locator('#prohibido').click();
    await expect(page).toHaveURL(`${ADMIN}/admin/entrar`);
    await expect(page.locator('h1')).toHaveAttribute('data-page', 'entrar');
  });

  test('a taken name shows the error of the remote rule: the question went to /admin/_fudic/rule/…', async ({ page }) => {
    await fallos(page);
    const paths = asked(page);
    await page.locator('#nombre').fill('admin');
    // A field shows its errors once the user leaves it.
    await page.locator('#nombre').blur();
    await expect(page.locator('#nombre-error')).toHaveText('Ese nombre ya está ocupado.');
    const rule = paths.filter((p) => p.includes('/_fudic/rule/'));
    expect(rule.length).toBeGreaterThan(0);
    expect(rule.every((p) => p.startsWith('/admin/_fudic/rule/'))).toBe(true);
  });
});

test.describe('an error page is a page: the same layout as the app’s pages (SDD-88 §4.3, criterion 29)', () => {
  test('admin: its error page (ui’s) and /admin/ are painted by the same layout, ui’s', async ({ page }) => {
    await page.goto(`${ADMIN}/admin/`);
    const home = await layoutOf(page);
    await page.goto(`${ADMIN}/admin/no-existe`);
    await expectUiPage(page, 404);
    const error = await layoutOf(page);
    expect(home).toEqual({ lang: 'es', viewport: 1, boot: ['/admin/fudic-boot.js'], main: 1 });
    expect(error).toEqual(home);
    // The error page sits inside the layout's <main>, as a route's body does.
    await expect(page.locator('body > main [data-error-page="ui"]')).toBeVisible();
  });

  test('tienda: its error page and / are painted by the same layout, tienda’s', async ({ page }) => {
    await page.goto(`${TIENDA}/`);
    const home = await layoutOf(page);
    const sheets = await page.evaluate(() => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
    await page.goto(`${TIENDA}/no-existe`);
    const error = await layoutOf(page);
    expect(home).toEqual({ lang: 'es', viewport: 1, boot: ['/fudic-boot.js'], main: 1 });
    expect(error).toEqual(home);
    // The project's guide sheet is on every page, each with its pruned copy (SDD-49), so it is
    // compared by name, not by hash. tienda.css styles only <tienda-card>, which the error page
    // does not render: its copy there is empty and nothing is written for it.
    const errorSheets = await page.evaluate(() => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
    const named = (urls: readonly string[]): string[] => urls.map((u) => new URL(u).pathname.replace(/-[\w-]+\.css$/u, '.css'));
    expect(named(sheets).filter((s) => s === '/assets/guide.css')).toHaveLength(1);
    expect(named(errorSheets)).toEqual(['/assets/guide.css']);
    await expect(page.locator('body > main [data-error-page="tienda"]')).toBeVisible();
  });
});

test.describe('tienda: its own page wins', () => {
  test('/no-existe is painted with the page of tienda, not with the one of ui', async ({ page }) => {
    const response = await page.goto(`${TIENDA}/no-existe`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-error-page="tienda"]')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('La tienda no encuentra eso (404)');
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Volver a la tienda' })).toHaveAttribute('href', '/');
  });
});
