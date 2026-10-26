/**
 * The strategy of a route (SDD-20 §4.8). It is declared IN THE ROUTE — making 100 routes
 * converge on one config file is how a build config becomes a merge conflict — on the `load`
 * line of its `.fudapi` (SDD-60 §3.4), which the build reads with the parser of `@fudic/api`
 * and never runs.
 */

import type { LoadDecl } from '@fudic/api';
import { type CachePolicy, type RouteMode } from '@fudic/transport';

export interface StrategyDecl {
  readonly mode?: RouteMode;
  readonly data?: { readonly ttl?: string; readonly policy?: CachePolicy };
  readonly page?: { readonly cache?: 'never' | 'persist'; readonly ttl?: string };
}

export interface StrategyAnalysis {
  /** Whether the route declared a strategy at all — the route is then the authority. */
  readonly declared: boolean;
  readonly strategy: StrategyDecl;
}

export const NO_STRATEGY: StrategyAnalysis = { declared: false, strategy: {} };

/**
 * The strategy a route's `.fudapi` declares on its `load` line (SDD-60 §3.4, §4.5): the line is
 * `strategy({ … })` entire, already checked by the parser (`FUD1074`), so it says nothing of
 * its own. Without a `load`, or a `load` with no option, the route declares nothing.
 */
export function strategyOfLoad(load: LoadDecl | undefined): StrategyAnalysis {
  if (load === undefined) return NO_STRATEGY;
  const data = {
    ...(load.ttl !== undefined ? { ttl: load.ttl.text } : {}),
    ...(load.policy !== undefined ? { policy: load.policy.text as CachePolicy } : {}),
  };
  const page =
    load.page === undefined
      ? undefined
      : { cache: load.page.value.text as 'never' | 'persist', ...(load.page.duration !== undefined ? { ttl: load.page.duration.text } : {}) };
  const strategy: StrategyDecl = {
    ...(load.mode !== undefined ? { mode: load.mode.text as RouteMode } : {}),
    ...(Object.keys(data).length > 0 ? { data } : {}),
    ...(page !== undefined ? { page } : {}),
  };
  return { declared: Object.keys(strategy).length > 0, strategy };
}
