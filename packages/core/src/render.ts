/**
 * The render-object contract (SDD-14 §4.5). The emit produces one render per
 * block/component; core only defines the shape. Each render owns exactly its
 * own nodes and its teardown — no diffing, no tree reconciliation.
 */

import { type Cursor, type Dom, type DomClient } from '@fudic/dom';

/**
 * Builds the initial tree of a block/component (build-time SSR/SSG). It is the
 * construction half `create()` shares: only the base `Dom<N>` contract, so the
 * same body runs on `browserDom` and `SsrDom`.
 */
export type SsrBuild<N> = (dom: Dom<N>, ctx: unknown, target: N) => void;

export interface Render<N> {
  /** Cold mount: build nodes via `dom` and anchor them to the target. */
  create(): void;
  /** Adopt the nodes the SSR already sent (by position/identity). */
  hydrate(cursor: Cursor<N>): void;
  /** Open subscriptions (fine-grained) and behavior. */
  mount(): void;
  /** Reactive re-evaluation; writes only into its own node, no diffing. */
  update(): void;
  /** Symmetric teardown: unsubscribe + detach. */
  remove(): void;
}

/** The whole render life is browser-only, hence the `DomClient<N>` demand. */
export type RenderFactory<N> = (dom: DomClient<N>, ctx: unknown, target: N) => Render<N>;
