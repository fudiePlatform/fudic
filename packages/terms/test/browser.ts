/**
 * Real Chrome for the runtime's tests, and a fake `TermHost` over its page that records what the
 * runtime tells it.
 */

import { chromium, type Browser, type Locator, type Page } from 'playwright-core';
import type { Box, TermHost } from '../src/index.js';

export function launch(): Promise<Browser> {
  return chromium.launch({ channel: 'chrome', headless: true });
}

export interface FakeHost extends TermHost {
  /** Every `onLocate`, in order. */
  readonly located: { readonly ref: string; readonly box: Box }[];
  /** Every target `settle` received, in order. */
  readonly settled: Locator[];
}

/** A host whose `settle` records the target and runs the gesture, and whose `onLocate` accumulates. */
export function fakeHost(page: Page): FakeHost {
  const located: { ref: string; box: Box }[] = [];
  const settled: Locator[] = [];
  return {
    page,
    located,
    settled,
    settle: (target, gesture) => {
      settled.push(target);
      return gesture();
    },
    onLocate: (ref, box) => {
      located.push({ ref, box });
    },
  };
}
