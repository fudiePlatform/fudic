/**
 * The defects `/signal-prop` exposes, measured where they hurt: a real browser.
 *
 * That page is the canonical demonstration of props-spec decision 86 — a `Signal<T>` prop
 * crosses as the OBJECT, a callback prop crosses as the function — and it is also where the
 * two halves of BUG-24 come apart. Both are reachable by clicking, and which one appears
 * depends only on WHICH BUTTON IS PRESSED FIRST, which is exactly the property a user is
 * never told about:
 *
 *  - press the child's button first and the runtime climbs to the owner alone, out of
 *    post-order, and the owner's hookup calls `u()` on a sibling that was never upgraded;
 *  - press the parent's button first and the subtree comes up in post-order, and then the
 *    owner overwrites the child's CELL with the raw function it holds locally.
 *
 * Neither is a rendering detail. In the first the page is dead; in the second the number
 * becomes `NaN`. So the assertions here are on the numbers the user reads, and the console
 * is collected as corroboration rather than as the measurement.
 *
 * Two invariants of the page, stated once and used by both tests: the three numbers are
 * three views of ONE cell, and `+1` and `Sumar 5` are two ways into the same value.
 */

import { test, expect, type Page } from '@playwright/test';

/** Everything the page threw or logged as an error, from the first byte. */
interface Failures {
  readonly errors: string[];
}

/**
 * Open `/signal-prop` cold, collecting failures.
 *
 * Both channels, because the two defects surface differently: a handler that throws inside a
 * listener reaches `pageerror`, while a rejection inside the runtime's own `async` walk only
 * ever reaches the console. A test that watched one of the two would be blind to one bug.
 */
async function open(page: Page): Promise<Failures> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/signal-prop');
  return { errors };
}

/** The parent's own line: «El padre tiene N.» */
const owner = (page: Page) => page.locator('signal-counter .own');
/** The child's two numbers: the cell it was handed, and the `computed` derived from it. */
const child = (page: Page) => page.locator('signal-display .out strong');
/** The grandchild, three levels down, holding the very same object. */
const grandchild = (page: Page) => page.locator('signal-grandchild .deep strong');

const plusOne = (page: Page) => page.locator('signal-counter .inc');
const addFive = (page: Page) => page.locator('signal-form .save');

/** The four numbers the page shows, as the user reads them. */
async function numbers(page: Page): Promise<readonly string[]> {
  return [
    (await owner(page).innerText()).replace(/\D+/gu, ''),
    ...(await child(page).allInnerTexts()),
    ...(await grandchild(page).allInnerTexts()),
  ];
}

test.describe('a callback prop crosses as a function, not as a cell to call twice', () => {
  test('pressing «Sumar 5» after the parent is alive adds 5 — it does not make NaN', async ({
    page,
  }) => {
    const { errors } = await open(page);

    // The parent first: this is the post-order path, the one the cascade was designed for.
    // The whole subtree comes up, and with it the owner's hookup — which is where the
    // callback's cell is filled and, today, immediately overwritten with the raw function.
    await plusOne(page).click();
    await expect(owner(page)).toHaveText('El padre tiene 1.');

    await addFive(page).click();

    // One cell, three consumers: the owner, the child and the grandchild all read the same
    // object, and the child's `computed` doubles it. `NaN` anywhere means the callback was
    // invoked with `undefined` — the cell was read as a value that was never a cell.
    await expect(owner(page)).toHaveText('El padre tiene 6.');
    expect(await numbers(page)).toEqual(['6', '6', '12', '6']);
    expect(errors).toEqual([]);
  });
});

test.describe('a child is interactive on its own, with the owner still cold', () => {
  test('pressing «Sumar 5» FIRST adds 5, with no prior gesture anywhere', async ({ page }) => {
    const { errors } = await open(page);

    // Nothing has been touched. This is the promise the page makes in its own prose — «el
    // hijo puede escribir con el padre todavía frío» — and it is the promise a user relies
    // on without knowing it: a button that is on the screen is a button that works.
    await addFive(page).click();

    await expect(owner(page)).toHaveText('El padre tiene 5.');
    expect(await numbers(page)).toEqual(['5', '5', '10', '5']);
    expect(errors).toEqual([]);
  });

  test('and the owner keeps working afterwards: +1 takes it to 6', async ({ page }) => {
    const { errors } = await open(page);

    await addFive(page).click();
    await expect(owner(page)).toHaveText('El padre tiene 5.');

    // The climb must leave the owner in a usable state, not merely reached: raising it
    // half-way — hooked up to the point where it threw — is what turns one broken click
    // into a page that stays broken.
    await plusOne(page).click();
    await expect(owner(page)).toHaveText('El padre tiene 6.');
    expect(await numbers(page)).toEqual(['6', '6', '12', '6']);
    expect(errors).toEqual([]);
  });
});
