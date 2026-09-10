/**
 * What does a `@click` inside a loop COST?
 *
 * SDD-37 is measured in the compiler by reading the emitted text: one `WeakMap`, one
 * `$dom.event`, and no `addEventListener` per row. That is a proof about the output, and
 * this suite is the other half — the same claim asserted in the browser, against the
 * numbers the platform itself reports.
 *
 * The page (`/delegacion`) patches `EventTarget.prototype` before anything loads and counts
 * every `addEventListener` and `removeEventListener` that happens in it. It carries two
 * calendars that are identical in markup, behaviour and row count and differ in one thing:
 *
 *  - `<app-calendar>`        one `@click` on the grid and a `delegate:day` per cell.
 *  - `<app-calendar-plain>`  a `@click` per cell, the way it is written today.
 *
 * So the assertion is a subtraction. Twenty-one rows are mounted and twenty-one retired on
 * both, with the same clicks in the same order: the delegated one must not move the counter
 * at all, and the plain one must move it by two per row in each direction — the cell and its
 * button. A page that only showed the first number would prove nothing; it is the pair that
 * says the saving is the delegation and not the shape of the test.
 *
 * Two more things are asserted here because the emitted text cannot show them:
 *
 *  - **The row arrives whole.** The handler is handed the row OBJECT, and the count of
 *    presses lives inside that object. If it goes 1, 2, 3 across clicks, the same object
 *    came back each time — a copy would reset it, an index would need a lookup.
 *  - **It is a getter and not a frozen value.** `u(...)` reassigns the block's parameter, so
 *    after `Invertir` the first cell must hand over the row that is now first. This is the
 *    exact case a value captured at create time gets wrong.
 *
 * And the path that made this page unprovable until now: `−7 filas` takes the list to ZERO
 * and `+7 filas` brings it back. That is BUG-26 — the block claimed the level's trailing
 * text node as its own, so the last row leaving took the insertion anchor with it and
 * nothing ever came back. Fixed on main, merged here, and asserted below so it stays fixed.
 *
 * On hydration: it is driven by the GESTURE (SDD-17), so nothing is alive before the first
 * click. Every helper below clicks first and asserts after, and `expect` retries until the
 * chunk has landed.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

/** The two counters, read from the page's own probe — the number the reader sees. */
async function counts(page: Page): Promise<{ add: number; remove: number }> {
  const read = async (id: string): Promise<number> =>
    Number((await page.locator(`#${id}`).textContent())?.trim() ?? '0');
  return { add: await read('probe-add'), remove: await read('probe-remove') };
}

/** Back to zero, and wait for it: every measurement below is a delta from here. */
async function reset(page: Page): Promise<void> {
  await page.locator('#probe-reset').click();
  await expect(page.locator('#probe-add')).toHaveText('0');
  await expect(page.locator('#probe-remove')).toHaveText('0');
}

const panel = (page: Page, tag: string) => ({
  cells: page.locator(`${tag} .cell`),
  cell: (i: number): Locator => page.locator(`${tag} .cell`).nth(i),
  add: page.locator(`${tag} .bar button.add`),
  drop: page.locator(`${tag} .bar button.drop`),
  shuffle: page.locator(`${tag} .bar button.shuffle`),
  last: page.locator(`${tag} output.last`),
  rows: page.locator(`${tag} output.rows`),
});

/**
 * Wake a calendar and leave it hydrated.
 *
 * The first click is the gesture that downloads the chunk, and it is replayed once the
 * component is alive — so the assertion on `output.last` is also what proves the chunk
 * landed. Waiting on the text rather than on a timeout is what makes the rest deterministic.
 */
async function wake(page: Page, tag: string): Promise<void> {
  const p = panel(page, tag);
  await p.cell(0).click();
  await expect(p.last).toHaveText('día 1 · pulsado 1 vez');
}

test.describe('/delegacion — what a `@click` in a loop costs', () => {
  const errors: string[] = [];

  test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/delegacion');
    await expect(page.locator('#probe-add')).toBeVisible();
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the delegated calendar mounts and retires 21 rows for zero listeners', async ({
    page,
  }) => {
    const p = panel(page, 'app-calendar');
    await wake(page, 'app-calendar');
    await reset(page);

    for (let i = 0; i < 3; i++) await p.add.click();
    await expect(p.rows).toHaveText('28');
    await expect(p.cells).toHaveCount(28);

    // Twenty-one rows are in the DOM and the platform was never asked for a listener.
    expect(await counts(page)).toEqual({ add: 0, remove: 0 });

    for (let i = 0; i < 3; i++) await p.drop.click();
    await expect(p.rows).toHaveText('7');
    await expect(p.cells).toHaveCount(7);

    // And nothing is given back, because nothing was taken.
    expect(await counts(page)).toEqual({ add: 0, remove: 0 });
  });

  test('the plain calendar pays two listeners per row, both ways', async ({ page }) => {
    const p = panel(page, 'app-calendar-plain');
    await wake(page, 'app-calendar-plain');
    await reset(page);

    for (let i = 0; i < 3; i++) await p.add.click();
    await expect(p.rows).toHaveText('28');

    // Twenty-one rows, and each one asks for the cell's listener and its button's.
    const mounted = await counts(page);
    expect(mounted.add).toBe(42);
    expect(mounted.remove).toBe(0);

    for (let i = 0; i < 3; i++) await p.drop.click();
    await expect(p.rows).toHaveText('7');

    // Retiring them hands every one of those back — the work the other calendar never does.
    const retired = await counts(page);
    expect(retired.add).toBe(42);
    expect(retired.remove).toBe(42);
  });

  test('the row arrives as its own object, so its count of presses adds up', async ({
    page,
  }) => {
    const p = panel(page, 'app-calendar');
    await wake(page, 'app-calendar');

    // The counter lives INSIDE the row object. A copy would come back at 1 every time.
    await p.cell(0).click();
    await expect(p.last).toHaveText('día 1 · pulsado 2 veces');
    await p.cell(0).click();
    await expect(p.last).toHaveText('día 1 · pulsado 3 veces');

    // A different cell carries its own count, untouched by the clicks on the first.
    await p.cell(3).click();
    await expect(p.last).toHaveText('día 4 · pulsado 1 vez');
  });

  test('after Invertir the first cell hands over the row that is now first', async ({
    page,
  }) => {
    const p = panel(page, 'app-calendar');
    await wake(page, 'app-calendar');

    await p.shuffle.click();
    await expect(p.cells.first()).toContainText('7');

    // A value captured at create time would still say "día 1" here: `u(...)` reassigns the
    // block's parameter, and the row registers a getter precisely so this reads the new one.
    await p.cell(0).click();
    await expect(p.last).toHaveText('día 7 · pulsado 1 vez');
  });

  test('a marker inside the shadow of a child still resolves — the button', async ({
    page,
  }) => {
    const p = panel(page, 'app-calendar');
    await wake(page, 'app-calendar');

    // The pencil is a `<button delegate:day>` nested inside the cell, and it carries its own
    // marker. It resolves through `composedPath()`, which is what a selector could not do
    // without writing the attribute §3.4 refuses to write.
    await p.cell(2).click();
    await expect(p.last).toHaveText('día 3 · pulsado 1 vez');

    // And it resolves to the SAME row as the cell around it: the count carries over rather
    // than starting again, which a second lookup keyed by anything else would not do.
    await p.cell(2).locator('button').click();
    await expect(p.last).toHaveText('día 3 · pulsado 2 veces');
  });

  test('the list survives reaching zero and coming back (BUG-26)', async ({ page }) => {
    const p = panel(page, 'app-calendar');
    await wake(page, 'app-calendar');
    await reset(page);

    // The last row leaving used to take the level's insertion anchor with it, and nothing
    // ever came back — no throw, no message, an empty grid for good.
    await p.drop.click();
    await expect(p.rows).toHaveText('0');
    await expect(p.cells).toHaveCount(0);

    await p.add.click();
    await expect(p.rows).toHaveText('7');
    await expect(p.cells).toHaveCount(7);

    // And the rows that came back are live rows, not just markup.
    await p.cell(0).click();
    await expect(p.last).toHaveText('día 101 · pulsado 1 vez');

    // All of that for no listener at all.
    expect(await counts(page)).toEqual({ add: 0, remove: 0 });
  });

  test('a form of twelve fields costs one listener per event type', async ({ page }) => {
    const first = page.locator('app-wide-form input').first();

    // The gesture that hydrates the form. Before SDD-37 each control asked its own element
    // for `input`, `change` and `blur`: three per field, thirty-six for this form.
    await first.click();
    await first.fill('hola');
    await expect(first).toHaveValue('hola');

    await reset(page);

    // Typing in every remaining field asks for nothing more: the root already listens, and
    // a field is a row in a table.
    const inputs = page.locator('app-wide-form input');
    await expect(inputs).toHaveCount(12);
    for (let i = 1; i < 12; i++) await inputs.nth(i).fill(`v${i}`);

    expect(await counts(page)).toEqual({ add: 0, remove: 0 });
  });
});
