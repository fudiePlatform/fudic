/**
 * A signal that lives in a module instead of inside a component — the shape every
 * signals framework calls a "store". One module instance per document, so the value is
 * the page's, not the component's: two `<signal-store>` on the same page read the same
 * cell. That is the intent, and it matches how fudic works — there is no SPA here, only
 * an SPA simulated by the Service Worker, so "per document" is the whole lifetime.
 *
 * Imported ONLY from `@code { @client }`, never from a server region: a module is loaded
 * once per Node process, so a store read on the server would carry state from one request
 * into the next.
 */

import { signal } from "@fudic/core";

export const count = signal(0);

export function inc(): void {
  count.set(count() + 1);
}
