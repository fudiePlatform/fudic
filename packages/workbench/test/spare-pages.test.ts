/**
 * The pages kept open in advance: a run takes ones already there, they are refilled only when no
 * criterion runs, and closing a page closes its own context, once. Against a Playwright browser
 * doubled down to what the adapter calls, so every open and close is counted.
 */

import type { Browser } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { CALL_TIMEOUT, LOAD_TIMEOUT, launchBrowser, SPARE_PAGES, VIEWPORT, type BrowserLike, type Launchers } from '../src/browser.js';

const settled = () => new Promise((done) => setTimeout(done, 0));

/** A browser whose contexts are numbered; `failing` says which opens throw, by number. */
function fakeBrowser(failing: (n: number) => boolean = () => false) {
  const opened: { options: unknown; timeouts: number[]; closed: number }[] = [];
  const browser = {
    async newContext(options: unknown) {
      const record = { options, timeouts: [] as number[], closed: 0 };
      const n = opened.push(record);
      if (failing(n)) throw new Error(`context ${n} refused`);
      const context = {
        n,
        close: async () => {
          record.closed += 1;
        },
        newPage: async () => ({
          context: () => context,
          setDefaultTimeout: (ms: number) => void record.timeouts.push(ms),
          setDefaultNavigationTimeout: (ms: number) => void record.timeouts.push(ms),
        }),
      };
      return context;
    },
    close: async () => undefined,
  };
  const launchers: Launchers = {
    chromium: { launch: async () => browser as unknown as Browser },
    firefox: { launch: async () => browser as unknown as Browser },
    webkit: { launch: async () => browser as unknown as Browser },
  };
  return { launchers, opened };
}

async function launched(failing?: (n: number) => boolean): Promise<{ browser: BrowserLike; opened: ReturnType<typeof fakeBrowser>['opened'] }> {
  const fake = fakeBrowser(failing);
  const browser = await launchBrowser('chromium', fake.launchers);
  if (!('newPage' in browser)) throw new Error('expected a browser');
  await settled();
  return { browser, opened: fake.opened };
}

describe('the spare pages', () => {
  it('opens SPARE_PAGES at launch, each in a context of its own at the fixed viewport, with the timeouts', async () => {
    const { opened } = await launched();
    expect(SPARE_PAGES).toBe(4);
    expect(opened).toHaveLength(SPARE_PAGES);
    for (const context of opened) {
      expect(context.options).toEqual({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: VIEWPORT.scale });
      expect(context.timeouts).toEqual([CALL_TIMEOUT, LOAD_TIMEOUT]);
    }
  });

  it('a run takes the ones already open, and opens one more only past them', async () => {
    const { browser, opened } = await launched();
    const pages = await Promise.all(Array.from({ length: SPARE_PAGES }, () => browser.newPage()));
    expect(opened).toHaveLength(SPARE_PAGES);
    pages.push(await browser.newPage());
    expect(opened).toHaveLength(SPARE_PAGES + 1);
  });

  it('refills only when no page is in use: never while a run goes on', async () => {
    const { browser, opened } = await launched();
    const first = await browser.newPage();
    const second = await browser.newPage();
    await first.close();
    await settled();
    expect(opened).toHaveLength(SPARE_PAGES);
    await second.close();
    await settled();
    // Two taken, two opened again: four waiting.
    expect(opened).toHaveLength(SPARE_PAGES + 2);
  });

  it('closing a page closes its context, once, however many ask', async () => {
    const { browser, opened } = await launched();
    const page = await browser.newPage();
    await Promise.all([page.close(), page.close()]);
    await page.close();
    // Its context closed once, and one spare opened in its place.
    expect(opened.map((c) => c.closed)).toEqual([1, 0, 0, 0, 0]);
    // Counted once too: another page taken and closed still refills.
    const next = await browser.newPage();
    await next.close();
    await settled();
    expect(opened.length).toBe(SPARE_PAGES + 2);
  });

  it('a spare that could not open is replaced by a fresh one when taken', async () => {
    const { browser, opened } = await launched((n) => n === 1);
    await browser.newPage();
    expect(opened).toHaveLength(SPARE_PAGES + 1);
    expect(opened.at(-1)!.timeouts).toEqual([CALL_TIMEOUT, LOAD_TIMEOUT]);
  });

  it('when the fresh one cannot open either, the error goes up and the page does not count as in use', async () => {
    const { browser, opened } = await launched((n) => n === 1 || n === 5);
    await expect(browser.newPage()).rejects.toThrow('context 5 refused');
    await settled();
    // Nothing in use: it refilled the one taken.
    expect(opened).toHaveLength(SPARE_PAGES + 2);
    const page = await browser.newPage();
    await page.close();
  });
});
