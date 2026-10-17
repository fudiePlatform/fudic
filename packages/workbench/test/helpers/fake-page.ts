/**
 * A page without a browser: what the engine and the extensions' host call on it, recorded, and
 * answers given per test. The real adapters are checked against Chrome in test/browser/.
 */

import type { Locator, Page } from 'playwright-core';
import { VIEWPORT, type BrowserLike, type LocatorLike, type PageLike } from '../../src/browser.js';

export interface FakeElement {
  /** Where it is in the page; x and y are 0 when left out. */
  box?: { x?: number; y?: number; width: number; height: number } | null;
  /** What a screenshot of it gives; a function to throw or to vary. */
  png?: Buffer | (() => Buffer);
  /** What the nearest-host script answers. */
  host?: { id: string; defined: boolean } | null;
}

export interface FakePage extends PageLike {
  readonly calls: string[];
  /** Fires the page's `pageerror` listener. */
  fail(message: string): void;
  closed: boolean;
}

/**
 * A Playwright locator as a term would hand it to `settle`: the fake page adopts it as the
 * element at the selector `ref`.
 */
export function fakeLocator(ref: string): Locator {
  return { toString: () => ref } as unknown as Locator;
}

export function fakePage(
  elements: (css: string) => FakeElement = () => ({}),
  options: { status?: number | null; goto?: () => Promise<never> } = {},
): FakePage {
  const calls: string[] = [];
  let listener: (message: string) => void = () => undefined;
  const page: FakePage = {
    // What the extensions receive: only its identity matters without a browser.
    page: { fake: 'playwright page' } as unknown as Page,
    adopt(locator) {
      calls.push(`adopt ${String(locator)}`);
      return page.locate(String(locator));
    },
    calls,
    closed: false,
    fail: (message) => listener(message),
    async goto(url) {
      // As Playwright does: a closed page refuses to navigate.
      if (page.closed) throw new Error('page.goto: Target page, context or browser has been closed');
      calls.push(`goto ${url}`);
      if (options.goto !== undefined) return options.goto();
      return options.status === undefined ? 200 : options.status;
    },
    locate(css) {
      const element = elements(css);
      const name = css;
      const locator: LocatorLike = {
        async box() {
          const box = element.box === undefined ? { width: 10, height: 20 } : element.box;
          return box === null ? null : { x: box.x ?? 0, y: box.y ?? 0, width: box.width, height: box.height };
        },
        async screenshot() {
          calls.push(`screenshot ${name}`);
          const png = element.png ?? Buffer.from(name);
          return typeof png === 'function' ? png() : png;
        },
        async evaluate<R>(script: string): Promise<R> {
          if (script.includes('data-fud-id')) return (element.host === undefined ? null : element.host) as R;
          throw new Error(`the fake page runs no script but the nearest host: ${script}`);
        },
      };
      return locator;
    },
    async evaluate<R>(script: string): Promise<R> {
      calls.push(script.includes('requestAnimationFrame') ? 'frame' : 'evaluate');
      return undefined as R;
    },
    async waitFor(_script, arg) {
      calls.push(`waitFor ${String(arg)}`);
    },
    async addInitScript() {
      calls.push('addInitScript');
    },
    async silenceWebSockets(matches) {
      const silenced = ['/@vite/client', '/', '/__bench/ws', '/__benchmark'].filter((p) =>
        matches(new URL(p, 'http://127.0.0.1')),
      );
      calls.push(`silence ${silenced.join(' ')}`);
    },
    onPageError(next) {
      listener = next;
    },
    async close() {
      page.closed = true;
      calls.push('close');
    },
  };
  return page;
}

export function fakeBrowser(page: FakePage): BrowserLike & { opened: number } {
  const browser = {
    name: 'chrome' as const,
    viewport: VIEWPORT,
    opened: 0,
    async newPage() {
      browser.opened += 1;
      return page;
    },
    close: async () => undefined,
  };
  return browser;
}
