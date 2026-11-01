// Dependency tracking is one module variable, the consumer running right now. A nested
// consumer installs itself and restores the previous one on the way out.

/** Something a consumer can depend on. */
export interface Dependency {
  /** The current version. A derived value may recompute to answer it. */
  version(): number;
  /** Adds the signals behind this dependency to `out`. */
  collectLeaves(out: Set<LeafSource>): void;
}

/** A signal: the only thing an effect ever subscribes to. */
export interface LeafSource extends Dependency {
  subscribe(fn: () => void): () => void;
}

/** An `effect` or a `computed` while it runs. */
export interface Consumer {
  add(dep: Dependency): void;
}

// The signal behind a value, if it is one.
const LEAF = Symbol('fudic.leaf');

// Marks both signals and derived values. An imported name reaches the compiled code with no
// type, and a derived value is a plain arrow function: without the mark a helper would be
// subscribed to, which means called.
const SOURCE = Symbol('fudic.source');

export function tagSource<T extends object>(value: T): T {
  Object.defineProperty(value, SOURCE, { value: true });
  return value;
}

export function tagLeaf<T extends object>(value: T, leaf: LeafSource): T {
  Object.defineProperty(value, LEAF, { value: leaf });
  return tagSource(value);
}

/** The signal behind `value`, or `null` for anything else, derived values included. */
export function leafOf(value: unknown): LeafSource | null {
  return (value as Record<symbol, LeafSource | undefined>)[LEAF] ?? null;
}

/** Whether `value` is a signal or a derived value. */
export function isSource(value: unknown): boolean {
  return (
    typeof value === 'function' && (value as unknown as Record<symbol, unknown>)[SOURCE] === true
  );
}

let active: Consumer | null = null;

/** Registers `dep` with the running consumer, if any. */
export function report(dep: Dependency): void {
  if (active !== null) {
    active.add(dep);
  }
}

/** Runs `fn` with `consumer` collecting every read it makes. */
export function runTracked<T>(consumer: Consumer | null, fn: () => T): T {
  const previous = active;
  active = consumer;
  try {
    return fn();
  } finally {
    active = previous;
  }
}

/** Runs `fn` without registering any of its reads as a dependency. */
export function untrack<T>(fn: () => T): T {
  return runTracked(null, fn);
}
