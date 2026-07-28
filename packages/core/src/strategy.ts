/**
 * `strategy()` — how a page declares its render mode (SDD-20 §4.8).
 *
 * It is a MARKER. The plugin reads the call statically at build time and never runs
 * it; at runtime this is a no-op, so importing it costs nothing and a page that ends
 * up in a client bundle does not break. The declaration lives in the page because
 * making 100 routes converge on one config file is how a build config turns into a
 * permanent merge conflict.
 */

export type RouteMode = 'ssr' | 'ssg' | 'sw';

export type CachePolicy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only';

export interface StrategyDecl {
  /** `ssr` (the server, always) · `ssg` (prerendered) · `sw` (rendered locally). */
  readonly mode?: RouteMode;
  /** The DATA policy. Only data ages, so only data has a TTL (`30s`/`5m`/`2h`/`7d`). */
  readonly data?: { readonly ttl?: string; readonly policy?: CachePolicy };
  /** Keep the rendered HTML per concrete URL. Its TTL is the data's — never a second one. */
  readonly page?: { readonly cache?: 'never' | 'persist'; readonly ttl?: string };
}

/** Declare this route's strategy. Read at build time; a no-op at runtime. */
export function strategy(_decl: StrategyDecl): void {
  // Intentionally empty: the build reads the call, it never executes it.
}
