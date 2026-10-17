/**
 * Waiting for a gesture to be served. A component not yet hydrated receives its first gesture
 * through the hydration capturer: it holds the gesture, loads the chunk, defines the tag and
 * REPLAYS it a few milliseconds after the click returned. A `then` that reads right away reads
 * the state from before.
 *
 * So a gesture the runtime hands the host (`TermHost.settle`) notes, before acting, the nearest hydratable host and whether its tag
 * is defined; after acting it waits for that host's `fud:hydrated` when it was not, and then one
 * frame, because the replay fires effects that paint afterwards.
 *
 * `waitForLoadState('networkidle')` does not do this: a page that was idle before the click is
 * idle at once after it.
 */

import type { LocatorLike, PageLike, PageScript } from './browser.js';

/** Where the observer keeps the ids it has seen. Only in the measuring instance. */
const SEEN = '__fudicBenchHydrated';

/** Init script: every `fud:hydrated` id from the first moment of the page. */
export const OBSERVER = `(() => {
  const seen = (globalThis.${SEEN} = new Set());
  document.addEventListener('fud:hydrated', (event) => seen.add(String(event.detail.id)));
})();`;

/** The nearest `[data-fud-id]` ancestor, crossing shadow roots like the capturer does. */
const NEAREST_HOST: PageScript = `(element) => {
  for (let node = element; node; node = node.parentNode ?? node.host) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-fud-id')) {
      return { id: node.getAttribute('data-fud-id'), defined: customElements.get(node.localName) !== undefined };
    }
  }
  return null;
}`;

const HYDRATED: PageScript = `(id) => globalThis.${SEEN}.has(id)`;

const FRAME: PageScript = `() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))`;

/** Runs an action and returns once the page has served the gesture. */
export async function settled<T>(page: PageLike, element: LocatorLike, act: () => Promise<T>): Promise<T> {
  const host = await element.evaluate<{ id: string; defined: boolean } | null>(NEAREST_HOST);
  const result = await act();
  if (host !== null && !host.defined) await page.waitFor(HYDRATED, host.id);
  await page.evaluate(FRAME);
  return result;
}
