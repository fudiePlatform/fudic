/**
 * SDD-80 criterion 38 — `alias-taken` is `runs remote`: on `/formularios` the browser asks the
 * server while the user types, and a taken alias is painted without sending anything. In the
 * three shapes, because the question is answered by the dev server in one and by the build's
 * edge in the other two, and it has to walk the client halves of the global chain (`csrf`) in
 * every one of them.
 *
 * The form says `validity interacted`: its rules speak once a field has been left. So the first
 * question goes out when the alias is left, and every keystroke after that asks again — which is
 * the «while typing» of the criterion.
 */

import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __ready: boolean;
    __hydrated: { readonly tag: string }[];
  }
}

/** The question of `alias-taken`: `RULE_PREFIX`, its file and its name (SDD-80 §3.3). */
const QUESTION = '/_fudic/rule/rules/people/alias-taken';

/** Load `/formularios` and wait for `app-form`, the owner of the form, to be up. */
async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__ready = false;
    window.__hydrated = [];
    document.addEventListener('fud:ready', () => {
      window.__ready = true;
    });
    document.addEventListener('fud:hydrated', (e) => {
      window.__hydrated.push((e as CustomEvent<{ tag: string }>).detail);
    });
  });
  await page.goto('/formularios');
  await page.waitForFunction(() => window.__ready);
  await page.waitForFunction(() => window.__hydrated.some((h) => h.tag === 'app-form'), null, { timeout: 10_000 });
}

const alias = (page: Page) => page.locator('app-form #ali input');
const aliasError = (page: Page) => page.locator('app-form #fud-e-userForm-alias');
const checking = (page: Page) => page.locator('app-form .comprobando');
const answered = (page: Page) => page.waitForResponse((r) => new URL(r.url()).pathname === QUESTION);

/** Every request the page makes to `/_fudic/`, as `METHOD path`. */
function record(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/_fudic/rule/') || path.startsWith('/_fudic/fn/')) asked.push(`${r.method()} ${path}`);
  });
  return asked;
}

test.describe('a remote rule while typing (SDD-80 criterion 38)', () => {
  test('a taken alias says so after «Comprobando…», while typing and without a submit', async ({ page }) => {
    await open(page);
    const asked = record(page);

    // Leaving the field: the form's first word on it, and the first question, about `adm`.
    const first = answered(page);
    await alias(page).fill('adm');
    await alias(page).blur();
    expect((await first).status()).toBe(200);
    await expect(aliasError(page)).toHaveText('');

    // Back in it, typing: faster than the debounce, so one question, about the whole value.
    await alias(page).focus();
    const second = answered(page);
    await alias(page).press('End');
    await alias(page).pressSequentially('in', { delay: 20 });
    await expect(checking(page)).toHaveText('Comprobando…');
    expect((await second).status()).toBe(200);
    await expect(aliasError(page)).toHaveText('Ese alias ya está cogido.');
    await expect(checking(page)).toHaveCount(0);
    // Two questions, no function: nothing was sent.
    expect(asked).toEqual([`POST ${QUESTION}`, `POST ${QUESTION}`]);
  });

  test('a free alias says nothing; going back to a known one asks no more', async ({ page }) => {
    await open(page);
    const asked = record(page);

    const first = answered(page);
    await alias(page).fill('admin');
    await alias(page).blur();
    await first;
    await expect(aliasError(page)).toHaveText('Ese alias ya está cogido.');

    const second = answered(page);
    await alias(page).fill('pedro');
    await second;
    await expect(aliasError(page)).toHaveText('');

    // `admin` again: the cache answers, in the act, and the network is not asked.
    await alias(page).fill('admin');
    await expect(aliasError(page)).toHaveText('Ese alias ya está cogido.');
    expect(asked).toHaveLength(2);
  });
});
