/**
 * The message contract of the client shell (SDD-20 §3.6, SDD-17 §4.7). With the render
 * living in the Service Worker there is no data channel any more: nothing streams between
 * threads. What is left is a control channel (`BroadcastChannel`, out-of-band) and two
 * main→SW notices — where the user is, and which hydration chunks are worth having ready.
 *
 * The two notices warm different things and neither subsumes the other: the location warms
 * the ROUTE the user is about to need, and the warm order warms the CHUNKS of the components
 * they can already see.
 */

/** Out-of-band control signals; they interest every thread at once. */
export type ControlMessage =
  | { readonly type: 'invalidate'; readonly route: string }
  | { readonly type: 'version'; readonly build: string }
  | { readonly type: 'purge'; readonly route: string };

/**
 * main → SW: "the user is here". The SINGLE warm trigger (SDD-20 §4.6.2): the
 * prototype had two (`activate` plus a document message) and neither waited for the
 * other, so every chunk was downloaded twice. `activate` does not warm.
 */
export const LOCATION_MESSAGE = 'fudic:here';

export interface LocationMessage {
  readonly type: typeof LOCATION_MESSAGE;
  readonly url: string;
}

/**
 * main → SW: "deposit these chunks" (SDD-17 §4.7). Ordered by the page's warm observer when
 * a component enters the viewport, never by `activate` — the same single-trigger rule as the
 * location notice, for the same reason.
 *
 * `urls` and `tags` are PARALLEL: the worker caches URLs, the page reports tags. The page's
 * own copy of these two strings lives in `@fudic/core` (`hydrate/warm/sw.ts`) because the
 * hydration runtime does not depend on this package; `@fudic/vite` pins the two together.
 */
export const WARM_MESSAGE = 'fudic:warm';

export interface WarmMessage {
  readonly type: typeof WARM_MESSAGE;
  readonly urls: readonly string[];
  readonly tags: readonly string[];
}

/** SW → main: these are in the cache, and not one of them was evaluated. */
export const WARMED_MESSAGE = 'fudic:warmed';

export interface WarmedMessage {
  readonly type: typeof WARMED_MESSAGE;
  readonly urls: readonly string[];
  readonly tags: readonly string[];
}
