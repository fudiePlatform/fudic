/**
 * `outlineOf`: a painted piece's accessibility tree in a real browser, as Playwright's ARIA
 * snapshot writes it. It is the reference `outline` of `@fudic/testing` answers the same as.
 */

import type { Page } from 'playwright-core';

/** The ARIA snapshot of what `selector` matches; the error's first line, as text, when it cannot be taken. */
export async function outlineOf(page: Page, selector: string): Promise<string> {
  try {
    return await page.locator(selector).ariaSnapshot();
  } catch (error) {
    // Playwright rejects with an Error, always.
    return `error: ${(error as Error).message.split('\n')[0]}`;
  }
}
