import { batch } from './batch.js';
import { computed, type Readable } from './computed.js';
import { effect } from './effect.js';
import { own } from './owner.js';
import { signal } from './signal.js';
import { untrack } from './tracking.js';

export type TaskState = 'idle' | 'pending' | 'done' | 'cancelled' | 'failed';
export type TaskMode = 'latest' | 'queue';

/** A function that takes its arguments and an `AbortSignal`, such as a server function. */
export type Callable<A, R> = ((args: A, options: { readonly signal: AbortSignal }) => Promise<R>) & {
  /** The HTTP verb of a server function. */
  readonly method?: string;
};

export interface TaskOptions<R> {
  /** Defaults to `latest` for a GET or a callable without `method`, `queue` otherwise. */
  readonly mode?: TaskMode;
  /** What `value()` returns before the first answer. */
  readonly initial?: R;
}

/**
 * A call with its state. The reads are tracked derived values, so a view can use them;
 * where nothing calls, such as on a server, they keep their initial values.
 */
export interface Task<A, R, V = R | undefined> {
  /** The last answer, or `initial`. Kept while a new call is in flight. */
  readonly value: Readable<V>;
  readonly state: Readable<TaskState>;
  readonly pending: Readable<boolean>;
  /** What the last failed call rejected with; `undefined` unless the state is `failed`. */
  readonly error: Readable<unknown>;
  /** Starts a call. Resolves with its answer, or `undefined` if it was cancelled, replaced or failed. Never rejects. */
  run(...args: A extends void ? [args?: A] : [args: A]): Promise<R | undefined>;
  /** Aborts the call in flight and drops the ones waiting. */
  cancel(): void;
}

type Outcome<R> = { readonly ok: true; readonly value: R } | { readonly ok: false; readonly error: unknown };

/**
 * Wraps `fn` with cancellation, state and ordering. In `latest` mode a new call aborts the
 * one in flight and a replaced call never writes its answer. In `queue` mode each call waits
 * for the previous one to settle, so writes never overtake each other. With `source`, the
 * task calls again whenever what `source` reads changes, but not on creation.
 */
export function task<A, R>(fn: Callable<A, R>, source?: () => A): Task<A, R>;
export function task<A, R>(
  fn: Callable<A, R>,
  source: (() => A) | undefined,
  options: TaskOptions<R> & { readonly initial: R },
): Task<A, R, R>;
export function task<A, R>(fn: Callable<A, R>, source?: () => A, options?: TaskOptions<R>): Task<A, R>;
export function task<A, R>(
  fn: Callable<A, R>,
  source?: () => A,
  options: TaskOptions<R> = {},
): Task<A, R> {
  const queue = (options.mode ?? (fn.method === undefined || fn.method === 'GET' ? 'latest' : 'queue')) === 'queue';
  const value = signal<R | undefined>(options.initial);
  const state = signal<TaskState>('idle');
  const error = signal<unknown>(undefined);

  // Bumped by every `latest` call and every cancel: calls of an older generation never write.
  let generation = 0;
  // Calls started and not yet settled or dropped.
  let outstanding = 0;
  let inFlight: AbortController | null = null;
  // In `queue` mode, what the next call waits for.
  let tail: Promise<unknown> = Promise.resolve();
  // The pending `run` promises of this generation.
  const waiting = new Set<(answer: R | undefined) => void>();
  let disposed = false;

  // A synchronous throw becomes a failure too; the outcome itself never rejects.
  const invoke = (args: A, controller: AbortController): Promise<Outcome<R>> => {
    inFlight = controller;
    return new Promise<R>((resolve) => {
      resolve(fn(args, { signal: controller.signal }));
    }).then(
      (answer): Outcome<R> => ({ ok: true, value: answer }),
      (reason: unknown): Outcome<R> => ({ ok: false, error: reason }),
    );
  };

  const settle = (outcome: Outcome<R>): R | undefined => {
    inFlight = null;
    outstanding -= 1;
    // One notification, so nothing sees the new value with the old state.
    batch(() => {
      if (outcome.ok) value.set(outcome.value);
      if (outstanding === 0) {
        error.set(outcome.ok ? undefined : outcome.error);
        state.set(outcome.ok ? 'done' : 'failed');
      }
    });
    return outcome.ok ? outcome.value : undefined;
  };

  // Resolves every pending `run` now rather than when `fn` settles: a `fn` that ignores its
  // signal may never settle.
  const drop = (): void => {
    generation += 1;
    outstanding = 0;
    inFlight?.abort();
    inFlight = null;
    // A call that ignores its abort must not hold back the next ones.
    tail = Promise.resolve();
    for (const resolve of waiting) resolve(undefined);
    waiting.clear();
  };

  const start = (args: A): Promise<R | undefined> => {
    if (disposed) return Promise.resolve(undefined);
    if (!queue) drop();
    batch(() => {
      error.set(undefined);
      state.set('pending');
    });
    outstanding += 1;
    const mine = generation;
    return new Promise<R | undefined>((resolve) => {
      waiting.add(resolve);
      const call = async (): Promise<void> => {
        if (mine !== generation) return;
        const outcome = await invoke(args, new AbortController());
        if (mine !== generation) return;
        waiting.delete(resolve);
        resolve(settle(outcome));
      };
      if (queue) tail = tail.then(call);
      else void call();
    });
  };

  const cancel = (): void => {
    if (outstanding === 0) return;
    drop();
    state.set('cancelled');
  };

  let stop: (() => void) | null = null;
  if (source !== undefined) {
    // The first run only learns what `source` reads.
    let first = true;
    stop = effect(() => {
      const args = source();
      if (first) {
        first = false;
        return;
      }
      untrack(() => void start(args));
    });
  }

  own(() => {
    cancel();
    disposed = true;
    stop?.();
  });

  return {
    // Derived, so the writable signals stay private.
    value: computed(() => value()),
    state: computed(() => state()),
    pending: computed(() => state() === 'pending'),
    error: computed(() => error()),
    run: (...args) => start(args[0] as A),
    cancel,
  };
}
