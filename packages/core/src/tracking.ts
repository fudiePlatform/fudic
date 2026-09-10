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

/**
 * The brand EVERY reactive source carries — a signal and a derived value alike.
 *
 * `LEAF` answers "which leaf is behind this", which only a signal has. This one answers
 * the weaker question "can this be subscribed to at all", and it exists because that is
 * the question an IMPORTED name raises: a component that writes `import { total } from
 * './store.js'` gives the emit a name and nothing else, and at runtime a derived value is
 * a bare arrow that looks exactly like a plain helper. Subscribing blind is not an option
 * — `subscribe` falls back to an effect that CALLS what it is given, so a helper would be
 * invoked instead of watched.
 */
const SOURCE = Symbol('fudic.source');

/** Brand `value` as something a consumer can subscribe to, and hand it back. */
export function tagSource<T extends object>(value: T): T {
  Object.defineProperty(value, SOURCE, { value: true });
  return value;
}

/** Brand `value` as a signal backed by `leaf`, and hand it back. */
export function tagLeaf<T extends object>(value: T, leaf: LeafSource): T {
  Object.defineProperty(value, LEAF, { value: leaf });
  return tagSource(value);
}

/** The leaf behind a signal, or `null` for anything else — a derived value included. */
export function leafOf(value: unknown): LeafSource | null {
  return (value as Record<symbol, LeafSource | undefined>)[LEAF] ?? null;
}

/** Whether `value` is a signal or a derived value — the only two things worth watching. */
export function isSource(value: unknown): boolean {
  return (
    typeof value === 'function' && (value as unknown as Record<symbol, unknown>)[SOURCE] === true
  );
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
