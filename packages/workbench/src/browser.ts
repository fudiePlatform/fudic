/**
 * The only file that imports Playwright. It adapts the real browser to the dozen calls the
 * workbench makes (`BrowserLike`, `PageLike`, `LocatorLike`), so everything else is written —
 * and can be checked — against those.
 *
 * Code that runs IN the page travels as source text (`PageScript`): it is the page's code, not
 * this process's, and a function literal here would be a Node function nobody calls.
 */

import { FUD0975 } from '@fudic/diagnostics';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import type { WorkbenchFailure } from './types.js';

/** Every call of a term's `ctx` gives up after this long. */
export const CALL_TIMEOUT = 5000;

/** The source of a function, run in the page: `(arg) => …`, or `(element, arg) => …` on a locator. */
export type PageScript = string;

/** An element by tag (a CSS selector) or by role and exact accessible name. */
export type Target = { readonly css: string } | { readonly role: string; readonly name?: string };

export interface LocatorLike {
  count(): Promise<number>;
  box(): Promise<{ readonly width: number; readonly height: number } | null>;
  isVisible(): Promise<boolean>;
  click(): Promise<void>;
  evaluate<R>(script: PageScript, arg?: unknown): Promise<R>;
}

export interface PageLike {
  /** Navigates and waits for `load`; the HTTP status, or null when there was no response. */
  goto(url: string): Promise<number | null>;
  locate(target: Target): LocatorLike;
  evaluate<R>(script: PageScript, arg?: unknown): Promise<R>;
  /** Resolves when `script(arg)` is truthy in the page. */
  waitFor(script: PageScript, arg: unknown): Promise<void>;
  /** Source run in every document of this page before its own scripts. */
  addInitScript(source: string): Promise<void>;
  /** Answers by nobody the WebSockets whose URL matches. */
  silenceWebSockets(matches: (url: URL) => boolean): Promise<void>;
  onPageError(listener: (message: string) => void): void;
  close(): Promise<void>;
}

export interface BrowserLike {
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

/** What `launchBrowser` needs of Playwright's `chromium`; injected for the failure path. */
export interface Launcher {
  launch(options: { readonly channel: string; readonly headless: boolean }): Promise<Browser>;
}

/** The system Chrome, without a window. */
export async function launchBrowser(launcher: Launcher = chromium): Promise<BrowserLike | WorkbenchFailure> {
  try {
    return adaptBrowser(await launcher.launch({ channel: 'chrome', headless: true }));
  } catch (error) {
    return { diagnostic: FUD0975({ reason: firstLine(error) }) };
  }
}

export function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n')[0]!;
}

function adaptBrowser(browser: Browser): BrowserLike {
  return {
    async newPage() {
      const page = await browser.newPage();
      page.setDefaultTimeout(CALL_TIMEOUT);
      return adaptPage(page);
    },
    close: () => browser.close(),
  };
}

/** A page script as a function Playwright can serialize: built here, run there. */
function inPage(script: PageScript, params: string): () => unknown {
  return new Function(params, `return (${script})(${params});`) as () => unknown;
}

function adaptPage(page: Page): PageLike {
  return {
    async goto(url) {
      const response = await page.goto(url, { waitUntil: 'load' });
      return response?.status() ?? null;
    },
    locate(target) {
      return adaptLocator('css' in target ? page.locator(target.css) : byRole(page, target));
    },
    evaluate: (script, arg) => page.evaluate(inPage(script, 'arg') as never, arg),
    async waitFor(script, arg) {
      await page.waitForFunction(inPage(script, 'arg') as never, arg, { timeout: CALL_TIMEOUT });
    },
    async addInitScript(source) {
      await page.addInitScript(source);
    },
    silenceWebSockets: (matches) => page.routeWebSocket(matches, () => undefined),
    onPageError(listener) {
      page.on('pageerror', (error) => listener(firstLine(error)));
    },
    close: () => page.close(),
  };
}

function byRole(page: Page, target: { readonly role: string; readonly name?: string }): Locator {
  const role = target.role as Parameters<Page['getByRole']>[0];
  return target.name === undefined ? page.getByRole(role) : page.getByRole(role, { name: target.name, exact: true });
}

function adaptLocator(locator: Locator): LocatorLike {
  return {
    count: () => locator.count(),
    box: () => locator.boundingBox(),
    isVisible: () => locator.isVisible(),
    click: () => locator.click(),
    evaluate: (script, arg) => locator.evaluate(inPage(script, 'element, arg') as never, arg),
  };
}
