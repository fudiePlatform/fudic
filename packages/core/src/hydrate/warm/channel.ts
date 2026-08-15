/**
 * The warm port (SDD-17 §4.7): depositing a chunk in cache WITHOUT evaluating it.
 *
 * Warm keeps the framework's founding invariant intact — zero component JavaScript executed
 * until the interaction. Precaching puts the module in storage; it does not evaluate it, does
 * not register the custom element and hydrates nothing. It is anticipated network, and only
 * that: hydration is correct with it and without it.
 *
 * It is a PORT because the answer depends on how the page was emitted, and only the bootstrap
 * knows: with a Service Worker in control the order is a `postMessage`; without one — no
 * `sw.json`, `pnpm dev`, a first load before `clients.claim()`, an insecure context — it is a
 * `<link rel="modulepreload">`. Keeping the branch out here is what keeps "no Service Worker"
 * from being a condition inside the runtime, and what keeps `@fudic/core` from importing
 * `@fudic/transport`.
 */

export interface WarmChannel {
  /**
   * Order the deposit of these chunks. `urls` and `tags` are parallel: the transport works
   * in URLs, the trace and the `fud:warmed` event speak in tags.
   */
  warm(urls: readonly string[], tags: readonly string[]): void;
}

/** A chunk is in place, and not one line of it was evaluated (SDD-17 §3). */
export const WARMED_EVENT = 'fud:warmed';

export interface WarmedDetail {
  readonly tag: string;
}

/**
 * Report a deposited chunk, in the one shape the event declares — so the two channels
 * cannot disagree on what a page listening for `fud:warmed` receives.
 */
export function announceWarmed(doc: Document, tag: string): void {
  const detail: WarmedDetail = { tag };
  doc.dispatchEvent(new CustomEvent(WARMED_EVENT, { detail }));
}

/**
 * The channel of a page that warms nothing. Not a degraded mode: a page may legitimately
 * decide that anticipated network is not worth it, and hydration does not change one line.
 */
export const nullWarmChannel: WarmChannel = {
  warm(): void {
    // Nothing to order, and nothing to report.
  },
};
