export type RouteMode = 'ssr' | 'ssg' | 'sw';

export type CachePolicy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only';

export interface StrategyDecl {
  /** `ssr`: rendered on the server · `ssg`: prerendered · `sw`: rendered by the Service Worker. */
  readonly mode?: RouteMode;
  /** How the page's data is cached. The TTL is written `30s`, `5m`, `2h` or `7d`. */
  readonly data?: { readonly ttl?: string; readonly policy?: CachePolicy };
  /** Whether the rendered HTML is kept per URL. It expires with the data. */
  readonly page?: { readonly cache?: 'never' | 'persist'; readonly ttl?: string };
}

/** Declares how a route renders. The build reads the call; at runtime it does nothing. */
export function strategy(_decl: StrategyDecl): void {
  // Intentionally empty.
}
