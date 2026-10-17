/**
 * `ctx.locate` over real Chrome: references by tag and by role through shadow roots, and the
 * workbench's rule — one reference, one element — with its mark for the shot.
 */

import type { Browser, Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { stock, type TermContext } from '../src/index.js';
import { fakeHost, launch, type FakeHost } from './browser.js';

let browser: Browser;
let page: Page;
let host: FakeHost;
let ctx: TermContext;

beforeAll(async () => {
  browser = await launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  host = fakeHost(page);
  ctx = stock.context!(undefined as never, host);
});

afterEach(async () => {
  await page.close();
});

/** A `ui-menu` whose items live in its shadow root. */
const MENU = `
  <ui-menu>
    <template shadowrootmode="open">
      <ul role="menu">
        <li role="menuitem">First</li>
        <li role="menuitem">First one</li>
        <li role="menuitem" data-x="2">Second</li>
      </ul>
    </template>
  </ui-menu>`;

describe('ctx.locate: references', () => {
  it('locates by tag', async () => {
    await page.setContent(MENU);
    expect(await ctx.locate('ui-menu').evaluate((el) => el.localName)).toBe('ui-menu');
  });

  it('locates by role through a shadow root', async () => {
    await page.setContent(MENU);
    expect(await ctx.locate('role:menu').evaluate((el) => el.localName)).toBe('ul');
  });

  it('locates by role and exact name through a shadow root', async () => {
    await page.setContent(MENU);
    const item = ctx.locate('role:menuitem/"First"');
    expect(await item.textContent()).toBe('First');
    expect(await ctx.locate('role:menuitem/"Second"').getAttribute('data-x')).toBe('2');
  });

  it('a tag selector pierces shadow roots too', async () => {
    await page.setContent(MENU);
    expect(await ctx.locate('ul').getAttribute('role')).toBe('menu');
  });
});

describe('ctx.locate: one element', () => {
  it('runs the call and reports the reference with its box', async () => {
    await page.setContent('<ui-box style="display:block;position:absolute;left:10px;top:20px;width:30px;height:40px"></ui-box>');
    expect(await ctx.locate('ui-box').isVisible()).toBe(true);
    expect(host.located).toEqual([{ ref: 'ui-box', box: { x: 10, y: 20, width: 30, height: 40 } }]);
  });

  it('marks once per checked call', async () => {
    await page.setContent(MENU);
    const menu = ctx.locate('role:menu');
    await menu.isVisible();
    await menu.getAttribute('role');
    expect(host.located.map((l) => l.ref)).toEqual(['role:menu', 'role:menu']);
  });

  it('does not mark an element without a box', async () => {
    await page.setContent('<ui-box style="display:none"></ui-box>');
    expect(await ctx.locate('ui-box').isVisible()).toBe(false);
    expect(host.located).toEqual([]);
  });
});

describe('ctx.locate: several elements', () => {
  const MESSAGE = 'role:menuitem matches 3 elements; a reference must match one';

  it.each([
    ['isVisible', (ctx: TermContext) => ctx.locate('role:menuitem').isVisible()],
    ['click', (ctx: TermContext) => ctx.locate('role:menuitem').click()],
    ['getAttribute', (ctx: TermContext) => ctx.locate('role:menuitem').getAttribute('data-x')],
    ['evaluate', (ctx: TermContext) => ctx.locate('role:menuitem').evaluate((el) => el.localName)],
    ['boundingBox', (ctx: TermContext) => ctx.locate('role:menuitem').boundingBox()],
  ])('%s rejects saying how many, and marks nothing', async (_name, call) => {
    await page.setContent(MENU);
    await expect(call(ctx)).rejects.toThrow(MESSAGE);
    expect(host.located).toEqual([]);
  });

  it('says how many for a tag reference too', async () => {
    await page.setContent('<ui-a></ui-a><ui-a></ui-a>');
    await expect(ctx.locate('ui-a').isVisible()).rejects.toThrow('ui-a matches 2 elements; a reference must match one');
  });

  it('the substring of a name does not count with an exact name', async () => {
    await page.setContent(MENU);
    // `First` would match `First one` too without `exact`.
    expect(await ctx.locate('role:menuitem/"First"').isVisible()).toBe(true);
  });
});

describe('ctx.locate: no element', () => {
  it('a checked call runs without marking', async () => {
    await page.setContent(MENU);
    expect(await ctx.locate('ui-none').isVisible()).toBe(false);
    expect(host.located).toEqual([]);
  });

  it('count() gives 0 and does not throw', async () => {
    await page.setContent(MENU);
    expect(await ctx.locate('ui-none').count()).toBe(0);
    expect(host.located).toEqual([]);
  });
});

describe('ctx.locate: free calls neither count nor mark', () => {
  it('count, all, evaluateAll and allTextContents speak of all the matches', async () => {
    await page.setContent(MENU);
    const items = ctx.locate('role:menuitem');
    expect(await items.count()).toBe(3);
    expect(await items.all()).toHaveLength(3);
    expect(await items.evaluateAll((els) => els.length)).toBe(3);
    expect(await items.allTextContents()).toEqual(['First', 'First one', 'Second']);
    expect(host.located).toEqual([]);
  });

  it('first, nth, locator and getByRole build another locator, unguarded', async () => {
    await page.setContent(MENU);
    const items = ctx.locate('role:menuitem');
    expect(await items.first().textContent()).toBe('First');
    expect(await items.nth(2).textContent()).toBe('Second');
    const menu = ctx.locate('ui-menu');
    expect(await menu.locator('li').count()).toBe(3);
    expect(await menu.getByRole('menuitem', { name: 'Second' }).textContent()).toBe('Second');
    expect(host.located).toEqual([]);
  });

  it("Playwright's own properties and the language's symbols pass through as they are", async () => {
    await page.setContent(MENU);
    const raw = page.locator('ui-menu');
    const guarded = ctx.locate('ui-menu');
    const privates = Object.getOwnPropertyNames(Object.getPrototypeOf(raw)).filter(
      (key) => key.startsWith('_') && typeof Reflect.get(raw, key) === 'function',
    );
    expect(privates.length).toBeGreaterThan(0);
    for (const key of privates) expect(Reflect.get(guarded, key)).toBe(Reflect.get(raw, key));

    const symbol = Symbol('probe');
    const probe = (): string => 'probe';
    Reflect.set(guarded, symbol, probe);
    expect(Reflect.get(guarded, symbol)).toBe(probe);
    expect(host.located).toEqual([]);
  });

  it('a value that is not a function is returned as is', async () => {
    await page.setContent(MENU);
    const guarded = ctx.locate('ui-menu');
    expect(guarded.page()).toBe(page);
    expect(String(guarded)).toBe(String(page.locator('ui-menu')));
    expect(Reflect.get(guarded, Symbol.iterator)).toBeUndefined();
  });
});
