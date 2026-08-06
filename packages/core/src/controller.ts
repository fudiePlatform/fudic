/**
 * The contract between the emitted component chunk and the base class that drives it
 * (SDD-15 §3.7). Types only: the implementation of `Controller` is the closure the emit
 * writes, and the implementation of `FudicElementCtor` is the anonymous subclass in the
 * chunk. Nothing here runs.
 */

/**
 * What a component's `static c($props)` returns. Exactly the four methods with an EXTERNAL
 * caller: `c` and `h` are routed by the instance entry points according to where the
 * instance came from (SSR markup vs created at runtime), `u` is called by whoever owns the
 * values, and `r` is fired by the browser through `disconnectedCallback`.
 *
 * `$m` (mount), `$s` (subscription) and `$a` (apply) are deliberately absent: they are
 * private closures of the factory, orchestrated by the four above. Exposing them would
 * offer methods no external consumer may call.
 *
 * **Why there IS a `u` (BUG-12).** What crosses a shadow boundary is a VALUE, never the
 * signal object: decision 84 says so, and SDD-17 makes it structural — the props of a
 * hydrated instance travel serialized in `fud-state`, and a signal is a function with a
 * live `Set` inside, which no payload can carry. So a child cannot subscribe to what its
 * parent owns. The property of a signal belongs to the parent; the child receives values,
 * and receiving one again is a CALL, not a property. `u` is that call, and the only write
 * surface a component has: one positional array, the same order as the payload.
 */
export interface Controller {
  /** create — fabricate the nodes, mount the structure and hook up. */
  c(): void;
  /** hydrate — adopt the SSR nodes by positional traversal and hook up. */
  h(): void;
  /** update — take a fresh positional payload and re-apply the values it carries. */
  u(props: readonly unknown[]): void;
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
