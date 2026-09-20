/**
 * What the load does NOT pay for (SDD-45 §4.4.1): the two pieces hydration needs the moment
 * something is hydrated, and not one instant earlier.
 *
 * A page can be opened and closed without touching anything, and that visit should not pay
 * for the material of hydrating. The capturer, the maps and the URL arithmetic are the load
 * — without them a click is lost rather than deferred. These two are not:
 *
 *  - **the DOM adapter**, which is what a component PAINTS with, and nothing paints until an
 *    instance comes up;
 *  - **the signal**, which is created when an instance is handed its state, and being handed
 *    state IS hydrating. Its tracking travels inside it.
 *
 * So they are asked for with a dynamic `import`, and the request lands in one of two places.
 * The **warm channel** orders them in the same idle batch as the chunk of the component that
 * came into view (§4.4.1), long before any gesture; and path 2 awaits them at its top, in
 * parallel with `ready`, where a warmed page finds them already there. What moving them out
 * cannot do is reintroduce the chain §1.5 rule 2 forbids, because the anticipation is exactly
 * what the warm channel was built for.
 *
 * **The `import` lives here and not in the generated coordinator**, and that is not a
 * preference: a dynamic `import` in application code makes the app's bundler inject its
 * preload helper — 1 100 bytes — into the one module every page loads. Inside a published
 * piece it is what it looks like, a request for a URL the framework already decided.
 *
 * Both specifiers are rewritten to published URLs when this package builds its runtime, so a
 * browser reads two `import("/_fudic/<version>/…")` and nothing else. The types come in with
 * `import type`, which leaves NO statement behind: a bare `import "@fudic/dom"` would be a
 * request for the very piece this module exists to defer.
 */

import type { DomClient } from '@fudic/dom';
import type { signal } from '../signal.js';

/** The pieces of §4.4.1, once they have landed. */
export interface DeferredPieces {
  /** The adapter a component paints with (`dom/browser`). */
  readonly dom: DomClient<Node>;
  /** How a cell is built (`core/signal`, with `core/tracking` inside it). */
  readonly signal: typeof signal;
}

/** Port: how the two pieces are fetched. Injected so the runtime is verifiable off-network. */
export type ImportDeferred = () => Promise<DeferredPieces>;

/**
 * The real request: two URLs, in ONE batch.
 *
 * `Promise.all` and not two awaits, because the second would be discovered only after the
 * first answered — a chain of two round trips for two modules that have nothing to do with
 * each other.
 */
export const importDeferred: ImportDeferred = async () => {
  const [dom, signal] = await Promise.all([import('@fudic/dom'), import('../signal.js')]);
  return { dom: dom.browserDom, signal: signal.signal };
};

/**
 * One download per page, however many paths ask for it.
 *
 * The memo holds the PROMISE and not the result, which is what makes the warm order and the
 * first gesture the same request instead of two: whoever arrives second waits on what is
 * already in flight.
 */
export function deferredOnce(load: ImportDeferred): ImportDeferred {
  let pending: Promise<DeferredPieces> | null = null;
  return () => (pending ??= load());
}
