/**
 * One component, two applications (SDD-43 §4.6, criterion 12).
 *
 * `ui-card` is defined in `libs/ui`, which consumes `libs/guia`, and both apps link it by
 * package name. What this drives in a real browser is the half a build cannot state: that the
 * component RENDERS the same in both — same shadow tree, same computed border — while each app
 * styles its own components differently.
 *
 * The apps set `--guia-accent` to different colours in their own guides. The shared card reads
 * that token and does NOT change: an app's sheet is adopted into the shadow roots of the
 * components that app defines, and this one is somebody else's.
 */

import { test, expect, type Page } from '@playwright/test';

const SHARED = 'ui-card[data-shared]';

/** The accent each app sets for the components IT defines, as its own guide writes it. */
const APPS = [
  { name: 'tienda', home: '/', own: 'tienda-card', accent: '#0f7b3f' },
  { name: 'admin', home: '/admin/', own: 'admin-panel', accent: '#7b0f5f' },
] as const;

/** The shadow tree of the shared card, as the browser built it. */
async function sharedCard(page: Page): Promise<{ html: string; border: string; title: string }> {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector);
    if (host === null) throw new Error(`no ${selector} on ${location.pathname}`);
    const article = host.shadowRoot?.querySelector('article');
    if (article === null || article === undefined) throw new Error('the card has no article');
    return {
      html: host.shadowRoot?.innerHTML ?? '',
      border: getComputedStyle(article).borderLeftColor,
      title: article.querySelector('h2')?.textContent ?? '',
    };
  }, SHARED);
}

test.describe('a component of a library, in two applications', () => {
  test('renders identically in both, and reads the guide of its own chain', async ({ page }) => {
    const rendered = [];
    for (const app of APPS) {
      await page.goto(app.home);
      await expect(page.locator(SHARED)).toBeVisible();
      rendered.push(await sharedCard(page));
    }

    const [tienda, admin] = rendered;
    expect(tienda?.title).toBe('Tarjeta compartida');
    expect(admin?.html, 'the shared component rendered differently in the two apps').toBe(
      tienda?.html,
    );
    // The accent comes from `libs/guia`, which is the chain of the package that DEFINES the
    // card — not from either app's own guide, which sets a different one.
    expect(admin?.border).toBe(tienda?.border);
    expect(tienda?.border).toBe('rgb(11, 95, 255)');
  });

  test('each app still styles the components it defines itself', async ({ page }) => {
    // The other half of §4.6: the app's own sheet IS adopted by the app's own components, so
    // the two apps look different everywhere except in what they borrowed.
    for (const app of APPS) {
      await page.goto(app.home);
      const accent = await page.evaluate((tag) => {
        const host = document.querySelector(tag);
        const inner = host?.shadowRoot?.querySelector('article, section, div');
        return inner === null || inner === undefined
          ? ''
          : getComputedStyle(inner).getPropertyValue('--guia-accent').trim();
      }, app.own);
      expect(accent, `${app.name} did not adopt its own guide`).toBe(app.accent);
    }
  });
});
