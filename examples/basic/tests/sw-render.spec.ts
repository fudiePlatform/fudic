/**
 * What the Service Worker RENDERS, in a real browser.
 *
 * This is the port of `scripts/sw-check.mjs` (SDD-20 §6.24–§6.27), which drove Chrome over
 * raw CDP. It covers the thing that killed the Web Worker model — route→route navigations
 * served by the SW itself, with the document arriving complete, the declarative shadow
 * roots materialized and the style polyfill running under a strict CSP — plus the criteria
 * the four BUGs added: exactly one document request per navigation, a render instead of a
 * cached HTML file per route, and an app that starts with the network off.
 *
 * One case of the original harness is deliberately NOT ported: «a warm prerendered page is
 * served from the SW cache» asserted the very behaviour BUG-02 corrects.
 */

import { test, expect } from '@playwright/test';
import { fromNetwork, measure, record, render, type Hit } from './traffic.js';

/** Land on `/` and wait until the Service Worker controls the page. */
async function boot(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForTimeout(1500);
}

/** The nonce the document was served with — read off the CSP header of its response. */
const nonceOf = (hits: readonly Hit[]): string | null => {
  const document = hits.find((h) => h.type === 'document' && h.fromServiceWorker);
  return document?.csp === undefined ? null : (/'nonce-([^']+)'/u.exec(document.csp)?.[1] ?? null);
};

test.describe('the Service Worker renders', () => {
  test('a route with `@server load` arrives complete, and its shadow roots materialize', async ({
    page,
  }) => {
    await boot(page);
    await page.goto('/blog');
    await page.waitForTimeout(800);
    await expect(page.locator('body')).toContainText('Blog');
    // The browser's own parser built these, because the SW answered a REAL navigation.
    expect(await page.evaluate(() => document.querySelector('app-card')?.shadowRoot !== null)).toBe(
      true,
    );
  });

  test('exactly one document request per navigation', async ({ page, context }) => {
    await boot(page);
    const recorder = record(context);
    const hits = await measure(recorder, page, () => page.goto('/blog'), { settleMs: 1200 });
    // `respondWith` plus a rescue `fetch` would make two rows for one URL. That was a real
    // bug, and `warm` downloading the HTML file was a second way to reach it (BUG-02).
    const documents = hits.filter((h) => h.type === 'document');
    expect(documents.map((h) => h.path)).toEqual(['/blog']);
  });

  test('route → route → back, served by the SW every time (the chain that hangs a Web Worker)', async ({
    page,
    context,
  }) => {
    await boot(page);
    await page.goto('/blog');
    await page.waitForTimeout(1200);

    const recorder = record(context);
    // First visit to this template: it is COLD, so the network serves it and the template
    // warms behind the navigation. That is the contract, not a defect (BUG-02 §6.6).
    const cold = await measure(recorder, page, () => page.goto('/blog/routing-por-fichero'), {
      settleMs: 1500,
    });
    await expect(page.locator('body')).toContainText('Routing por sistema de ficheros');
    expect(await page.evaluate(() => document.querySelector('app-badge')?.shadowRoot !== null)).toBe(
      true,
    );
    expect(cold.find((h) => h.type === 'document')?.fromServiceWorker).toBe(false);

    const warm = await measure(recorder, page, () => page.goto('/blog/routing-por-fichero'), {
      settleMs: 1200,
    });
    await expect(page.locator('body')).toContainText('Routing por sistema de ficheros');

    const back = await measure(recorder, page, () => page.goto('/blog'), { settleMs: 1200 });
    await expect(page.locator('body')).toContainText('Blog');

    for (const [label, hits] of [
      ['the warm post', warm],
      ['back to /blog', back],
    ] as ReadonlyArray<readonly [string, readonly Hit[]]>) {
      const document = hits.find((h) => h.type === 'document');
      expect(document?.fromServiceWorker, `${label}: the SW served it`).toBe(true);
    }
  });

  test('BUG-02 a prerendered route is RENDERED, not replayed: its nonce changes', async ({
    page,
    context,
  }) => {
    // `/blog/routing-por-fichero` has a prerendered `.html` on disk. Once warm, the SW
    // must build the document from chunk + data — and the proof is that a fresh nonce
    // comes out every time. Replaying a cached file cannot do that.
    await boot(page);
    const recorder = record(context);
    await measure(recorder, page, () => page.goto('/blog/routing-por-fichero'), { settleMs: 1500 });
    const first = await measure(recorder, page, () => page.reload(), { settleMs: 1200 });
    const second = await measure(recorder, page, () => page.reload(), { settleMs: 1200 });

    const a = nonceOf(first);
    const b = nonceOf(second);
    expect(a, 'the SW did not serve the document').not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    // And the token never survives into what the browser receives (§4.5).
    expect(await page.content()).not.toContain('__FUDIC_NONCE__');
  });

  test('the style-adoption polyfill runs, and nothing violates the CSP', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy/iu.test(message.text())) {
        violations.push(message.text());
      }
    });
    await boot(page);
    await page.goto('/blog');
    await page.waitForTimeout(1200);
    const adopted = await page.evaluate(() =>
      [...document.querySelectorAll('*')].some(
        (el) => (el.shadowRoot?.adoptedStyleSheets.length ?? 0) > 0,
      ),
    );
    expect(adopted, 'the inline polyfill did not run under the nonce').toBe(true);
    expect(violations, violations.join('\n')).toEqual([]);
  });

  test('BUG-01 the app starts with the network off', async ({ page, context }) => {
    // The one reason `install` precaches a shell. Two loads to warm everything, then the
    // network goes away: the navigation must still be served AND `/fudic-main.js` must
    // arrive, or the document loads and its script 404s.
    await boot(page);
    await page.reload();
    await page.waitForTimeout(1500);

    const recorder = record(context);
    await context.setOffline(true);
    const offline = await measure(recorder, page, () => page.reload(), { settleMs: 2000 });
    console.log(render('OFFLINE reload', offline));
    await context.setOffline(false);

    const document = offline.find((h) => h.type === 'document' && h.path === '/');
    expect(document?.fromServiceWorker, 'the navigation was not served offline').toBe(true);
    const main = offline.filter((h) => h.path === '/fudic-main.js');
    expect(main.length, '/fudic-main.js was not requested').toBeGreaterThan(0);
    expect(main.every((h) => h.fromServiceWorker && !h.failed), JSON.stringify(main)).toBe(true);
    expect(fromNetwork(offline).filter((h) => !h.failed).map((h) => h.path)).toEqual([]);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
