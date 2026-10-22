/**
 * A signal that lives in a module instead of inside a component — the shape every
 * signals framework calls a "store". One module instance per document, so the value is
 * the page's, not the component's: two `<signal-store>` on the same page read the same
 * cell. That is the intent, and it matches how fudic works — there is no SPA here, only
 * an SPA simulated by the Service Worker, so "per document" is the whole lifetime.
 *
 * Only the browser writes it: the server paints its initial value and nothing else, because a
 * module is loaded once per Node process, so a store written on the server would carry state
 * from one request into the next.
 */

import { signal } from "@fudic/core";

export const count = signal(0);

export function inc(): void {
  count.set(count() + 1);
}
