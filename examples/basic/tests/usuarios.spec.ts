/**
 * SDD-60 §6.32 — `/usuarios` and the sign-up of `user-form`, driven in a real browser.
 *
 * Every button of the page calls a function of a `.fudapi`, and every one of those has its
 * handler in `src/server`: the list from `load`, the search and its cancellation, the session
 * token of `auth`, a toggle, a delete, a 500, a 404, and the sign-up with the email the server
 * says is taken and the 409 of `admin`. The assertions were run against the build of `main`,
 * before the `.fudapi`, and pass there unchanged: this is how the page behaved with `@server`.
 *
 * The people table lives in the server's memory, so the order of the tests matters: each one
 * leaves the table as it found it, except the sign-up, which adds a person and then deletes it.
 */

import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __hydrated: string[];
  }
}

/**
 * Wait until the route — and the form, when asked — has hydrated. `fud:ready` is not enough:
 * it says the runtime is installed, and the route comes up a few milliseconds later. A click in
 * between lands on HTML with no handler.
 */
async function ready(page: Page, ...tags: readonly string[]): Promise<void> {
  await page.waitForFunction(
    (wanted) => wanted.every((t) => window.__hydrated.includes(t)),
    ['usuarios', ...tags],
    { timeout: 10_000 },
  );
}

/** Load `/usuarios`, with `token` in `localStorage` from the first byte of every load. */
async function open(page: Page, token?: string, ...tags: readonly string[]): Promise<void> {
  await page.addInitScript((t) => {
    window.__hydrated = [];
    document.addEventListener('fud:hydrated', (e) => {
      window.__hydrated.push((e as CustomEvent<{ tag: string }>).detail.tag);
    });
    if (t !== null) localStorage.setItem('fudic-token', t);
  }, token ?? null);
  await page.goto('/usuarios');
  await ready(page, ...tags);
}

/** The error page `error-pages` takes the browser to, with what the server said. */
const errorPage = (status: number) => new RegExp(`/_fudic/error/${String(status)}(\\?|$)`, 'u');

const row = (page: Page, name: string) => page.locator('tbody tr', { hasText: name });
const status = (page: Page) => page.getByRole('status').first();
const form = (page: Page) => page.locator('user-form');

test.describe('/usuarios', () => {
  test('load paints the people table', async ({ page }) => {
    await open(page);
    await expect(row(page, 'Ana')).toContainText('ana@fudic.dev');
    await expect(row(page, 'Luis')).toContainText('41');
    await expect(row(page, 'Marta')).toBeVisible();
  });

  test('search answers with the matching people', async ({ page }) => {
    await open(page);
    await page.getByLabel('Buscar por nombre').fill('mar');
    await expect(page.locator('ul li')).toHaveText(['Marta — marta@fudic.dev']);
    await expect(status(page)).toHaveText('');
  });

  test('the slow search can be cancelled', async ({ page }) => {
    await open(page);
    // The slow search has a status of its own, in its own panel.
    const slow = page.locator('.panel', { has: page.getByRole('button', { name: 'Cancelar' }) }).getByRole('status');
    await page.getByRole('button', { name: 'Búsqueda lenta (3 s)' }).click();
    await expect(slow).toHaveText('Buscando…');
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(slow).toHaveText('Búsqueda cancelada.');
  });

  test('the session token lives in the browser', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Token: ninguno')).toBeVisible();
    await page.getByRole('button', { name: 'Entrar como Ana' }).click();
    await expect(page.getByText('Token: ana')).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page.getByText('Token: ana')).toBeVisible();
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.getByText('Token: ninguno')).toBeVisible();
  });

  test('a toggle without a token is a 401 page', async ({ page }) => {
    await open(page);
    await row(page, 'Marta').getByLabel('Activo').click();
    await expect(page).toHaveURL(errorPage(401));
    await expect(page.locator('h1')).toContainText('401');
    await expect(page.getByText('sin token')).toBeVisible();
  });

  test('a toggle with an unknown token goes to /entrar', async ({ page }) => {
    await open(page, 'pepe');
    await row(page, 'Marta').getByLabel('Activo').click();
    await expect(page).toHaveURL(/\/entrar$/u);
  });

  test('a toggle with a token reaches the server and survives a reload', async ({ page }) => {
    await open(page, 'ana');
    const box = () => row(page, 'Luis').getByLabel('Activo');
    await expect(box()).not.toBeChecked();
    // No reload: the page asks for its `data` again and repaints the row (SDD-68 §4.8).
    await box().click();
    await expect(box()).toBeChecked();
    await page.reload();
    await ready(page);
    await expect(box()).toBeChecked();
    // Back as it was, for the tests that come after.
    await box().click();
    await expect(box()).not.toBeChecked();
    await page.reload();
    await ready(page);
    await expect(box()).not.toBeChecked();
  });

  test('a failure nobody catches is the 500 page', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Un 500' }).click();
    await expect(page).toHaveURL(errorPage(500));
    await expect(page.locator('h1')).toContainText('500');
  });

  test('deleting nobody is the 404 page, with what the server said', async ({ page }) => {
    await open(page, 'ana');
    await page.getByRole('button', { name: 'Borrar a alguien que no existe' }).click();
    await expect(page).toHaveURL(errorPage(404));
    await expect(page.getByText('no hay nadie con id 999')).toBeVisible();
  });
});

/** The URL of `search` and its family. */
const FN = '/_fudic/fn/routes/usuarios';

/** `?a=` of a `{ q: str }` in fud-bin: the length of `q` as a varint, its bytes, in base64url. */
function binQ(q: string): string {
  const text = Buffer.from(q, 'utf8');
  const length: number[] = [];
  let n = text.length;
  do {
    length.push(n > 127 ? (n & 127) | 128 : n);
    n >>= 7;
  } while (n > 0);
  return Buffer.concat([Buffer.from(length), text]).toString('base64url');
}

test.describe('SDD-67: every call in binary, and the rules of its arguments', () => {
  test('criterion 5: the search leaves in fud-bin, signed, and its answer comes back in fud-bin', async ({ page }) => {
    await open(page);
    const request = page.waitForRequest((r) => r.url().includes(`${FN}/search?`));
    const response = page.waitForResponse((r) => r.url().includes(`${FN}/search?`));
    await page.getByLabel('Buscar por nombre').fill('mar');
    const sent = await request;
    expect(sent.headers()['fud-sig']).toMatch(/^[0-9a-f]{8}$/u);
    expect(new URL(sent.url()).searchParams.get('a')).toBe(binQ('mar'));
    expect((await response).headers()['content-type']).toBe('application/fud+bin');
    await expect(page.locator('ul li')).toHaveText(['Marta — marta@fudic.dev']);
  });

  test('criterion 15: 81 characters never leave the browser; sent by hand, the server says the same', async ({ page }) => {
    await open(page);
    // A valid search first: the signature its page sends, to send by hand as the page would.
    const first = page.waitForRequest((r) => r.url().includes(`${FN}/search?`));
    await page.getByLabel('Buscar por nombre').fill('mar');
    const sig = (await first).headers()['fud-sig']!;
    await expect(page.locator('ul li')).toHaveText(['Marta — marta@fudic.dev']);

    const searches: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes(`${FN}/search?`)) searches.push(r.url());
    });
    await page.getByLabel('Buscar por nombre').fill('x'.repeat(81));
    await page.waitForTimeout(500);
    expect(searches).toEqual([]);
    // The list is the one before: the call was refused, nothing came back.
    await expect(page.locator('ul li')).toHaveText(['Marta — marta@fudic.dev']);

    const byHand = await page.request.get(`${FN}/search?a=${binQ('x'.repeat(81))}`, { headers: { 'fud-sig': sig } });
    expect(byHand.status()).toBe(400);
    expect(byHand.headers()['content-type']).toBe('application/problem+fud');
    expect((await byHand.body()).toString('utf8')).toContain('argument q: max-length 80');
    const fits = await page.request.get(`${FN}/search?a=${binQ('x'.repeat(80))}`, { headers: { 'fud-sig': sig } });
    expect(fits.status()).toBe(200);
  });

  test('criterion 8: a page older than the server is a 412', async ({ page }) => {
    const stale = await page.request.get(`${FN}/search?a=${binQ('mar')}`, { headers: { 'fud-sig': '00000000' } });
    expect(stale.status()).toBe(412);
    expect((await stale.body()).toString('utf8')).toContain('the page is older than the server');
  });

  test('criterion 11: searchJson answers JSON with its keys, without a signature', async ({ page }) => {
    const a = encodeURIComponent(JSON.stringify({ q: 'mar' }));
    const res = await page.request.get(`${FN}/searchJson?a=${a}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/json');
    expect(await res.json()).toEqual([expect.objectContaining({ name: 'Marta', email: 'marta@fudic.dev' })]);

    const long = encodeURIComponent(JSON.stringify({ q: 'x'.repeat(81) }));
    const refused = await page.request.get(`${FN}/searchJson?a=${long}`);
    expect(refused.status()).toBe(400);
    expect(refused.headers()['content-type']).toBe('application/problem+json');
    expect(await refused.json()).toMatchObject({ status: 400, detail: 'argument q: max-length 80' });
  });
});

test.describe('user-form', () => {
  /** `user-form` hydrates on its first gesture, not on load: a click brings it up. */
  async function fill(page: Page, name: string, email: string): Promise<void> {
    await form(page).getByLabel('Nombre').click();
    await ready(page, 'user-form');
    await form(page).getByLabel('Nombre').fill(name);
    await form(page).getByLabel('Email').fill(email);
    await form(page).getByLabel('Edad').fill('30');
  }
  const submit = (page: Page) => form(page).getByRole('button', { name: 'Dar de alta' }).click();
  const saved = (page: Page, code: number) =>
    page.waitForResponse((r) => r.url().endsWith('/save') && r.status() === code);

  test('the server says the email is taken, on its field', async ({ page }) => {
    await open(page, 'ana');
    await fill(page, 'Otra', 'ana@fudic.dev');
    await Promise.all([saved(page, 422), submit(page)]);
    await expect(form(page).getByText('Ese email ya lo usa otra persona.')).toBeVisible();
    await expect(row(page, 'Otra')).toHaveCount(0);
  });

  test('admin is a 409 the form keeps: no error page, nothing saved', async ({ page }) => {
    await open(page, 'ana');
    await fill(page, 'admin', 'admin@fudic.dev');
    await Promise.all([saved(page, 409), submit(page)]);
    await expect(page).toHaveURL(/\/usuarios$/u);
    await expect(form(page).getByText(/Guardado/u)).toHaveCount(0);
  });

  test('a valid sign-up adds the person, and delete takes it away', async ({ page }) => {
    await open(page, 'ana');
    await fill(page, 'Nuevo', 'nuevo@fudic.dev');
    await Promise.all([saved(page, 200), submit(page)]);
    await expect(form(page).getByText(/Guardado: Nuevo \(id \d+\)/u)).toBeVisible();
    // The component emits the person on the bus and the route paints the row: no reload.
    await expect(row(page, 'Nuevo')).toContainText('nuevo@fudic.dev');
    await row(page, 'Nuevo').getByRole('button', { name: 'Borrar' }).click();
    await expect(row(page, 'Nuevo')).toHaveCount(0);
  });
});
