/**
 * The only file that drives Playwright. It adapts the real browser to the dozen calls the
 * workbench makes (`BrowserLike`, `PageLike`, `LocatorLike`), so everything else is written —
 * and can be checked — against those. The page underneath goes, untouched, to the extensions.
 *
 * Code that runs IN the page travels as source text (`PageScript`): it is the page's code, not
 * this process's, and a function literal here would be a Node function nobody calls.
 */

import { FUD0975 } from '@fudic/diagnostics';
import { chromium, firefox, webkit, type Browser, type Locator, type Page } from 'playwright-core';
import type { Viewport } from './protocol.js';
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

/**
 * Loading a criterion's page gives up after this long. It is not a term's call: the first pages
 * of a cold Vite compile in parallel, under whatever else the machine is doing, and a criterion
 * that errors because the server was busy says nothing about the component.
 */
export const LOAD_TIMEOUT = 30_000;

/** Playwright's own default, written down: the shell says it, and a shot is measured in it. */
export const VIEWPORT: Viewport = { width: 1280, height: 720, scale: 1 };

/** The source of a function, run in the page: `(arg) => …`, or `(element, arg) => …` on a locator. */
export type PageScript = string;

export interface LocatorLike {
  /** Its box in the page, in pixels; null when it is not rendered. */
  box(): Promise<{ readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null>;
  evaluate<R>(script: PageScript, arg?: unknown): Promise<R>;
  /** A PNG of the element as the page shows it. */
  screenshot(): Promise<Buffer>;
}

export interface PageLike {
  /** The Playwright page underneath: what the extensions and the terms receive. */
  readonly page: Page;
  /** One of the terms' locators, as the workbench reads it. */
  adopt(locator: Locator): LocatorLike;
  /** Navigates and waits for `load`; the HTTP status, or null when there was no response. */
  goto(url: string): Promise<number | null>;
  /** An element by CSS selector: the mounted component. */
  locate(css: string): LocatorLike;
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
  /** The size every page opens at: fixed, so a shot means the same on every machine. */
  readonly viewport: Viewport;
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

/** Pages kept open in advance: as many as criteria run at once by default. */
export const SPARE_PAGES = 4;

/**
 * Every criterion gets a page in a context of its own, so none inherits another's state. Opening
 * one costs a few hundred milliseconds, and several at once cost more each: so they are opened in
 * advance — at launch and whenever no criterion is running — and a run takes ones already open.
 */
function adaptBrowser(name: BrowserName, browser: Browser): BrowserLike {
  const open = async (): Promise<Page> => {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
      deviceScaleFactor: VIEWPORT.scale,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(CALL_TIMEOUT);
    page.setDefaultNavigationTimeout(LOAD_TIMEOUT);
    return page;
  };
  // A spare that could not open (the browser is closing) is undefined: whoever takes it opens one.
  const spare: Promise<Page | undefined>[] = [];
  let inUse = 0;
  const refill = (): void => {
    while (spare.length < SPARE_PAGES) spare.push(open().catch(() => undefined));
  };
  refill();
  return {
    name,
    viewport: VIEWPORT,
    async newPage() {
      inUse++;
      // Opening the next ones while criteria run would slow them: it waits for the run to end.
      const done = (): void => {
        if (--inUse === 0) refill();
      };
      let page: Page;
      try {
        page = (await spare.shift()) ?? (await open());
      } catch (error) {
        done();
        throw error;
      }
      return adaptPage(page, done);
    },
    close: () => browser.close(),
  };
}

/** A page script as a function Playwright can serialize: built here, run there. */
function inPage(script: PageScript, params: string): () => unknown {
  return new Function(params, `return (${script})(${params});`) as () => unknown;
}

function adaptPage(page: Page, closed: () => void): PageLike {
  let closing: Promise<void> | undefined;
  return {
    page,
    adopt: adaptLocator,
    async goto(url) {
      const response = await page.goto(url, { waitUntil: 'load' });
      return response?.status() ?? null;
    },
    locate(css) {
      return adaptLocator(page.locator(css));
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
    // Closed once, whoever asks first (a cancel and the engine's `finally` both do): the context
    // goes with the page.
    close: () =>
      (closing ??= page
        .context()
        .close()
        .finally(closed)),
  };
}

function adaptLocator(locator: Locator): LocatorLike {
  return {
    box: () => locator.boundingBox(),
    evaluate: (script, arg) => locator.evaluate(inPage(script, 'element, arg') as never, arg),
    screenshot: () => locator.screenshot({ animations: 'disabled' }),
  };
}
