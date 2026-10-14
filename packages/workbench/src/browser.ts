/**
 * The only file that imports Playwright. It adapts the real browser to the dozen calls the
 * workbench makes (`BrowserLike`, `PageLike`, `LocatorLike`), so everything else is written —
 * and can be checked — against those.
 *
 * Code that runs IN the page travels as source text (`PageScript`): it is the page's code, not
 * this process's, and a function literal here would be a Node function nobody calls.
 */

import { FUD0975 } from '@fudic/diagnostics';
import { chromium, firefox, webkit, type Browser, type Locator, type Page } from 'playwright-core';
import type { WorkbenchFailure } from './types.js';

/** A browser the criteria can run in: the system's Chrome or Edge, or one Playwright downloads. */
export type BrowserName = 'chrome' | 'msedge' | 'chromium' | 'firefox' | 'webkit';

/** What `--browser` takes: a name, or `auto`. */
export type BrowserChoice = BrowserName | 'auto';

export const BROWSER_CHOICES: readonly BrowserChoice[] = ['auto', 'chrome', 'msedge', 'chromium', 'firefox', 'webkit'];

/** `auto`, in order: the two a machine usually has, then the one Playwright can download. */
const AUTO: readonly BrowserName[] = ['chrome', 'msedge', 'chromium'];

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
  /** Which browser it is: the shell and the binary say it. */
  readonly name: BrowserName;
  newPage(): Promise<PageLike>;
  close(): Promise<void>;
}

/** What `launchBrowser` needs of one of Playwright's browser types. */
export interface Launcher {
  launch(options: { readonly channel?: string; readonly headless: boolean }): Promise<Browser>;
}

/** Playwright's three browser types; injected for the failure paths. */
export interface Launchers {
  readonly chromium: Launcher;
  readonly firefox: Launcher;
  readonly webkit: Launcher;
}

const PLAYWRIGHT: Launchers = { chromium, firefox, webkit };

/** How each name launches: a browser type, and a channel for the system's own. */
function launchOf(name: BrowserName, launchers: Launchers): () => Promise<Browser> {
  if (name === 'chrome' || name === 'msedge') return () => launchers.chromium.launch({ channel: name, headless: true });
  return () => launchers[name].launch({ headless: true });
}

/** The command that downloads what Playwright can download: the asked one, or its Chromium. */
export function installCommand(choice: BrowserChoice): string {
  const name = choice === 'firefox' || choice === 'webkit' ? choice : 'chromium';
  return `npx playwright-core install ${name}`;
}

/** A browser without a window: the first of `auto` that starts, or exactly the one asked for. */
export async function launchBrowser(
  choice: BrowserChoice = 'auto',
  launchers: Launchers = PLAYWRIGHT,
): Promise<BrowserLike | WorkbenchFailure> {
  const tried = choice === 'auto' ? AUTO : [choice];
  let reason = '';
  for (const name of tried) {
    try {
      return adaptBrowser(name, await launchOf(name, launchers)());
    } catch (error) {
      reason = `${name}: ${firstLine(error)}`;
    }
  }
  return { diagnostic: FUD0975({ tried, reason, install: installCommand(choice) }) };
}

export function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n')[0]!;
}

function adaptBrowser(name: BrowserName, browser: Browser): BrowserLike {
  return {
    name,
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
