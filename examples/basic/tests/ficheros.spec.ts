/**
 * SDD-81 §4.6 — files, in a real browser, in dev and in preview (and in the build without a
 * Service Worker): the photo of `user-form` up and back in the table, a photo too big refused
 * by the browser and, forced past it, by the server with a 413; a big upload to `app-adjuntos`
 * with its bar, and one cancelled half way, whose temporary file goes; the CSV by its link.
 *
 * The memory of a 200 MB upload is measured where the server process can be read, in
 * `@fudic/server`'s own tests (criteria 17 and 23): here the same upload goes through the dev
 * server and the preview, end to end.
 */

import { test, expect, type Page } from '@playwright/test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

declare global {
  interface Window {
    __ready: boolean;
    __hydrated: string[];
  }
}

/** Load `path` and wait for the runtime, recording what hydrates. */
async function open(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    window.__ready = false;
    window.__hydrated = [];
    document.addEventListener('fud:ready', () => {
      window.__ready = true;
    });
    document.addEventListener('fud:hydrated', (e) => {
      window.__hydrated.push((e as CustomEvent<{ tag: string }>).detail.tag);
    });
  });
  await page.goto(path);
  await page.waitForFunction(() => window.__ready, undefined, { timeout: 10_000 });
}

async function hydrated(page: Page, tag: string): Promise<void> {
  await page.waitForFunction((t) => window.__hydrated.includes(t), tag, { timeout: 10_000 });
}

/** A 1×1 PNG, and `padding` bytes after its end: a browser paints it all the same. */
function png(padding: number): Buffer {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  );
  return Buffer.concat([pixel, Buffer.alloc(padding)]);
}

const MB = 1024 * 1024;

/** A file of `size` bytes on the disk, for an upload too big to hand over as a buffer. */
function bigFile(size: number, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-e2e-'));
  const path = join(dir, name);
  writeFileSync(path, Buffer.alloc(size, 7));
  return path;
}

/** The temporary directories of the disk spool (`@fudic/server/node`) there are now. */
function spools(): Set<string> {
  return new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('fudic-upload-')));
}

const row = (page: Page, name: string) => page.locator('tbody tr', { hasText: name });
const userForm = (page: Page) => page.locator('user-form');
const adjuntos = (page: Page) => page.locator('app-adjuntos');

/** Sign in as Ana and fill `user-form` with `name`. */
async function fill(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Entrar como Ana' }).click();
  await expect(page.locator('.quien')).toHaveText('ana');
  await userForm(page).getByLabel('Nombre').click();
  await hydrated(page, 'user-form');
  await userForm(page).getByLabel('Nombre').fill(name);
  await userForm(page).getByLabel('Email').fill(`${name.toLowerCase()}@fudic.dev`);
  await userForm(page).getByLabel('Edad').fill('30');
}

/**
 * Keep, in the page, the `FormData` of every call that sends one: Playwright gives no body of a
 * request whose body is a `FormData` of files. Before the page loads.
 */
async function keepParts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const kept: FormData[] = [];
    (window as unknown as { __parts: FormData[] }).__parts = kept;
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      if (body instanceof FormData) kept.push(body);
      send.call(this, body);
    };
  });
}

interface SentPart {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  /** Its bytes in base64, for `$args` only: the files are big. */
  readonly base64: string;
}

/** The parts of the last `FormData` the page sent, in order. */
function lastParts(page: Page): Promise<readonly SentPart[]> {
  return page.evaluate(async () => {
    const kept = (window as unknown as { __parts: FormData[] }).__parts;
    const out: SentPart[] = [];
    for (const [name, value] of kept[kept.length - 1]!) {
      const blob = value as Blob;
      let text = '';
      if (name === '$args') for (const byte of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(byte);
      out.push({ name, type: blob.type, size: blob.size, base64: btoa(text) });
    }
    return out;
  });
}

test.describe('the photo of user-form', () => {
  test('a 1 MB photo goes up with the form and the table paints it', async ({ page }) => {
    await keepParts(page);
    await open(page, '/usuarios');
    await fill(page, 'Foto');
    await userForm(page).getByLabel('Foto').setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: png(MB) });
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith('/save') && r.method() === 'PUT'),
      userForm(page).getByRole('button', { name: 'Dar de alta' }).click(),
    ]);
    // Multipart, with the rest of the fields in binary first and the photo after, by its path.
    expect((await request.allHeaders())['content-type']).toMatch(/^multipart\/form-data; boundary=/u);
    const parts = await lastParts(page);
    expect(parts.map((p) => [p.name, p.type])).toEqual([
      ['$args', 'application/fud+bin'],
      ['avatar', 'image/png'],
    ]);
    expect(parts[1]!.size).toBe(png(MB).length);
    const img = row(page, 'Foto').locator('img');
    await expect(img).toHaveAttribute('alt', 'Foto de Foto');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1);
    // The link is the function's: a `get` the browser asked for, with no script.
    expect(await img.getAttribute('src')).toMatch(/\/_fudic\/fn\/routes\/usuarios\/avatar\?a=/u);
    await row(page, 'Foto').getByRole('button', { name: 'Borrar' }).click();
    await expect(row(page, 'Foto')).toHaveCount(0);
  });

  test('a 3 MB photo or a PDF is refused on choosing; forced past the browser, the server says 413', async ({ page }) => {
    await keepParts(page);
    await open(page, '/usuarios');
    await fill(page, 'Grande');
    const sent: string[] = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/save')) sent.push(r.url());
    });
    const foto = userForm(page).getByLabel('Foto');
    await foto.setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
    await expect(userForm(page).getByText('Tiene que ser PNG o JPEG.')).toBeVisible();
    await foto.setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: png(3 * MB) });
    await expect(userForm(page).getByText('Como mucho 2 MB.')).toBeVisible();
    await userForm(page).getByRole('button', { name: 'Dar de alta' }).click();
    await expect(userForm(page).getByText('Como mucho 2 MB.')).toBeVisible();
    expect(sent).toEqual([]);

    // Forced: the same call a good photo makes, with the big one in its place.
    await foto.setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: png(10) });
    // Held while its parts are read, then dropped: it never reaches the server. The page goes to
    // its error page then, a network error being nobody's to keep.
    let good: { url: string; headers: Record<string, string>; args: SentPart } | undefined;
    await page.route('**/save', async (route) => {
      good = { url: route.request().url(), headers: await route.request().allHeaders(), args: (await lastParts(page))[0]! };
      await route.abort();
    });
    await userForm(page).getByRole('button', { name: 'Dar de alta' }).click();
    await expect.poll(() => good !== undefined).toBe(true);
    const args = good!.args;
    const boundary = 'fudic-forced';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="$args"\r\ncontent-type: ${args.type}\r\n\r\n`),
      Buffer.from(args.base64, 'base64'),
      Buffer.from(`\r\n--${boundary}\r\ncontent-disposition: form-data; name="avatar"; filename="grande.png"\r\ncontent-type: image/png\r\n\r\n`),
      png(3 * MB),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const forced = await page.request.put(good!.url, {
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'x-fudic-csrf': good!.headers['x-fudic-csrf']!,
        'fud-sig': good!.headers['fud-sig']!,
      },
      data: body,
    });
    expect(forced.status()).toBe(413);
    // A problem travels in the function's format, `fud-bin` here: the field is in it as text.
    expect((await forced.body()).toString('latin1')).toContain('avatar');
    await page.unroute('**/save');
    await page.goto('/usuarios');
    await expect(row(page, 'Ana')).toBeVisible();
    await expect(row(page, 'Grande')).toHaveCount(0);
  });
});

test.describe('app-adjuntos', () => {
  test('200 MB go up with the bar moving, and the server says what arrived', async ({ page }) => {
    test.setTimeout(240_000);
    const path = bigFile(200 * MB, 'grande.bin');
    try {
      await open(page, '/formularios');
      await adjuntos(page).getByLabel('Documentos').focus();
      await hydrated(page, 'app-adjuntos');
      await adjuntos(page).getByLabel('Documentos').setInputFiles(path);
      await adjuntos(page).getByRole('button', { name: 'Adjuntar' }).click();
      await expect(adjuntos(page).getByRole('progressbar', { name: 'Subiendo' })).toBeVisible();
      await expect(adjuntos(page).getByRole('status')).toHaveText(`Llegaron 1 (${String(200 * MB)} bytes): grande.bin.`, {
        timeout: 200_000,
      });
      await expect(adjuntos(page).getByRole('progressbar')).toHaveCount(0);
    } finally {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
  });

  test('cancelled half way: the upload stops, and its temporary file on the server goes', async ({ page }) => {
    test.setTimeout(120_000);
    const path = bigFile(200 * MB, 'cancelado.bin');
    const before = spools();
    try {
      await open(page, '/formularios');
      await adjuntos(page).getByLabel('Documentos').focus();
      await hydrated(page, 'app-adjuntos');
      await adjuntos(page).getByLabel('Documentos').setInputFiles(path);
      await adjuntos(page).getByRole('button', { name: 'Adjuntar' }).click();
      const bar = adjuntos(page).getByRole('progressbar', { name: 'Subiendo' });
      // Half way, or near it: the server has started its temporary file.
      await expect.poll(async () => Number(await bar.getAttribute('value')), { timeout: 60_000 }).toBeGreaterThan(20 * MB);
      await expect.poll(() => [...spools()].filter((d) => !before.has(d)).length).toBeGreaterThan(0);
      await adjuntos(page).getByRole('button', { name: 'Cancelar' }).click();
      await expect(adjuntos(page).getByRole('status')).toHaveText('Subida cancelada.');
      await expect(bar).toHaveCount(0);
      await expect.poll(() => [...spools()].filter((d) => !before.has(d)), { timeout: 30_000 }).toEqual([]);
    } finally {
      rmSync(join(path, '..'), { recursive: true, force: true });
    }
  });
});

test.describe('the CSV', () => {
  test('«Exportar CSV» downloads the table, by its link, with its name', async ({ page }) => {
    await open(page, '/usuarios');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Exportar CSV' }).click()]);
    expect(download.suggestedFilename()).toBe('personas.csv');
    const dir = mkdtempSync(join(tmpdir(), 'fudic-e2e-'));
    try {
      const file = join(dir, 'personas.csv');
      await download.saveAs(file);
      const lines = readFileSync(file, 'utf8').split('\n');
      expect(lines[0]).toBe('id,name,email,age,active,notes');
      expect(lines[1]).toBe('1,Ana,ana@fudic.dev,34,true,');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
