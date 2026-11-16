/**
 * The headers of the app (SDD-84): what `page.headers`, `sw.headers` and `assets.headers` say is
 * what goes out, in a real build. It runs in `preview` (with a Service Worker) and in `nosw`.
 * Both previews are plain `http:`, so no response carries HSTS (§4.1).
 */

import { test, expect, type Page } from '@playwright/test';

const hasWorker = (name: string): boolean => name === 'preview';

/** Every CSP or Trusted Types violation the page reports while it loads and hydrates. */
function violations(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Trusted Type/iu.test(text)) seen.push(text);
  });
  page.on('pageerror', (error) => {
    if (/Trusted|Content Security Policy/iu.test(error.message)) seen.push(error.message);
  });
  return seen;
}

test('a page carries the headers of page.headers, with a new nonce per response', async ({ request }) => {
  const first = await request.get('/');
  const second = await request.get('/');
  const csp = first.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("img-src 'self' data: https://images.example.com");
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain('require-trusted-types-for');
  const nonceOf = (value: string) => /'nonce-([^']+)'/u.exec(value)?.[1];
  expect(nonceOf(csp)).toBeTruthy();
  expect(nonceOf(csp)).not.toBe(nonceOf(second.headers()['content-security-policy'] ?? ''));
  expect(first.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(first.headers()['cross-origin-opener-policy']).toBe('same-origin');
  expect(first.headers()['strict-transport-security']).toBeUndefined();
  const html = await first.text();
  expect(html).not.toContain('__FUDIC_NONCE__');
  expect(html).toContain(`nonce="${nonceOf(csp)}"`);
});

test('the static files take the most specific rule of assets.headers', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const asset = /\/assets\/[^"'\s]+\.(?:js|css)/u.exec(html)?.[0];
  expect(asset).toBeTruthy();
  const hashed = await request.get(asset!);
  expect(hashed.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect(hashed.headers()['content-security-policy']).toBeUndefined();
  const logo = await request.get('/logo.svg');
  expect(logo.headers()['cache-control']).toBe('no-cache');
});

test('/fudic-sw.js carries sw.headers and the headers of fudic', async ({ request }, info) => {
  test.skip(!hasWorker(info.project.name), 'no Service Worker in this build');
  const sw = await request.get('/fudic-sw.js');
  expect(sw.headers()['content-security-policy']).toBe("default-src 'self'; script-src 'self' 'unsafe-eval'");
  expect(sw.headers()['cache-control']).toBe('no-cache');
  expect(sw.headers()['service-worker-allowed']).toBeTruthy();
});

test('a page hydrates under the strict policy without a single violation', async ({ page }) => {
  const seen = violations(page);
  // A hydrating page twice (the second, painted by the worker in preview), raw HTML and a form.
  for (const path of ['/hidratacion', '/hidratacion', '/raw', '/formularios']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(seen).toEqual([]);
});
