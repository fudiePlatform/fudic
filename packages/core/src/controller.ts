/**
 * The contract between the emitted component chunk and the base class that drives it
 * (SDD-15 §3.7). Types only: the implementation of `Controller` is the closure the emit
 * writes, and the implementation of `FudicElementCtor` is the anonymous subclass in the
 * chunk. Nothing here runs.
 */

/**
 * What a component's `static c($props)` returns. Exactly the three methods with an
 * EXTERNAL caller: `c` and `h` are routed by the instance entry points according to where
 * the instance came from (SSR markup vs created at runtime), and `r` is fired by the
 * browser through `disconnectedCallback`.
 *
 * `m` (mount) and `s` (subscription) are deliberately absent: they are private closures of
 * the factory, orchestrated by `c` and `h`. Exposing them would offer methods no external
 * consumer may call.
 *
 * There is no `u` (update). An N3 component has no external write surface — signals, props
 * and nodes live only inside the controller's closure — so nothing could invoke a
 * recomposition. A signal that changes notifies its fine-grained subscription directly.
 */
export interface Controller {
  /** create — fabricate the nodes, mount the structure and hook up. */
  c(): void;
  /** hydrate — adopt the SSR nodes by positional traversal and hook up. */
  h(): void;
  /** remove — symmetric teardown. */
  r(): void;
}

/**
 * The constructor side of an emitted component: the factory, reached through
 * `this.constructor` so the base invokes the concrete component's factory without knowing
 * it.
 *
 * This exists as a separate type because TypeScript has no `static abstract` member: the
 * signature SDD-15 §3.7 writes inside the abstract class cannot be declared there. The
 * semantics are unchanged — the base still resolves the factory dynamically per subclass —
 * only the place the type is written moves.
 *
 * `$props` is always `[$dom, $shadow, ...values]`: the adapter, the shadow root, and the
 * positional state values behind them.
 */
export interface FudicElementCtor {
  c(props: readonly unknown[]): Controller;
}
