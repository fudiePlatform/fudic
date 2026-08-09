/**
 * Dependency tracking (SDD-31 §4.1). One module-level variable — the consumer
 * that is running right now — and nothing else: no global graph, no scheduler,
 * no node ids. Tracking is dynamic and reentrant, so a `computed` read inside an
 * `effect` runs with its own consumer installed and hands the previous one back
 * on the way out.
 *
 * A tracked read is `sig()`; `sig.peek()` never looks at the active consumer.
 * That is the whole difference between the two, and until this module existed
 * they were the same function.
 */

/** Something a consumer can depend on: versioned, and resolvable to leaf signals. */
export interface Dependency {
  /**
   * The current version. A pull source (a `computed`) may recompute to answer
   * this, which is exactly what makes the cascade of §4.2 work.
   */
  version(): number;
  /** Add the leaf signals behind this dependency to `out`. */
  collectLeaves(out: Set<LeafSource>): void;
}

/**
 * A leaf: a signal. The only thing an `effect` ever subscribes to — a derived
 * value is traversed, never subscribed (§4.3).
 */
export interface LeafSource extends Dependency {
  subscribe(fn: () => void): () => void;
}

/** Whatever is collecting dependencies while it runs: an `effect` or a `computed`. */
export interface Consumer {
  add(dep: Dependency): void;
}

/**
 * A signal's back-reference to its own leaf, hidden behind a symbol. It is how
 * `subscribe` tells a signal from a derived value without either of them
 * carrying a method the public surface would then have to explain.
 */
const LEAF = Symbol('fudic.leaf');

/** Brand `value` as a signal backed by `leaf`, and hand it back. */
export function tagLeaf<T extends object>(value: T, leaf: LeafSource): T {
  Object.defineProperty(value, LEAF, { value: leaf });
  return value;
}

/** The leaf behind a signal, or `null` for anything else — a derived value included. */
export function leafOf(value: unknown): LeafSource | null {
  return (value as Record<symbol, LeafSource | undefined>)[LEAF] ?? null;
}

let active: Consumer | null = null;

/** Called by a tracked read. Outside any consumer it is a no-op. */
export function report(dep: Dependency): void {
  if (active !== null) {
    active.add(dep);
  }
}

/** Run `fn` with `consumer` collecting every tracked read it performs. */
export function runTracked<T>(consumer: Consumer, fn: () => T): T {
  const previous = active;
  active = consumer;
  try {
    return fn();
  } finally {
    active = previous;
  }
}

/**
 * Run `fn` without tracking any read. Restores in `finally`: if `fn` throws, the
 * tracking context cannot be left disarmed.
 */
export function untrack<T>(fn: () => T): T {
  const previous = active;
  active = null;
  try {
    return fn();
  } finally {
    active = previous;
  }
}
