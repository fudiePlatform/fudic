/**
 * `task` — a call with its cancellation, its state and its order (SDD-68 §3.1, §4).
 *
 * It takes the FUNCTION, not a call: `task(search, …)`, so the task is the one that hands
 * over the `AbortSignal` and reads the verb. A server function carries its verb as
 * `method`; anything without one is a read.
 *
 * Two orders, and the verb picks one:
 *
 * - **`latest`** (a GET, or any callable without `method`): a new call aborts the one in
 *   flight, and the answer of a replaced call is never written — even when `fn` ignored the
 *   signal. Calls are numbered by `generation`, and only the current one writes.
 * - **`queue`** (POST, PUT, PATCH, DELETE): a new call waits for the previous one to settle,
 *   however it settles, and then leaves. Nothing is dropped and nothing overtakes, because
 *   reordering two `save`s is how the database ends up disagreeing with the screen.
 *
 * `run` never rejects: an `@click` that calls it has nobody to catch. The failure is in
 * `error()`, and an abort is never a failure. `error-pages` acts before any of this, because
 * it is a step INSIDE the call: what it navigates away from never settles here.
 *
 * On the server nobody writes a signal and nobody clicks, so a task never calls there:
 * `state()` is `'idle'` and `value()` is `initial`, which is where the browser hydrates from.
 */

import { computed, type Readable } from './computed.js';
import { effect } from './effect.js';
import { own } from './owner.js';
import { signal } from './signal.js';
import { untrack } from './tracking.js';

export type TaskState = 'idle' | 'pending' | 'done' | 'cancelled' | 'failed';
export type TaskMode = 'latest' | 'queue';

/** Anything that takes its arguments and an AbortSignal: a server function is one. */
export type Callable<A, R> = ((args: A, options: { readonly signal: AbortSignal }) => Promise<R>) & {
  /** The HTTP verb of a server function. Absent on any other callable. */
  readonly method?: string;
};

export interface TaskOptions<R> {
  /** Default: 'latest' for a GET or a callable without `method`, 'queue' for the rest. */
  readonly mode?: TaskMode;
  /** What value() returns before the first answer. */
  readonly initial?: R;
}

/**
 * The four reads are `Readable`s, derived values like a `computed`, and not methods: that is
 * what makes `@if (found.pending())` a portable view. On the server a task never calls, so
 * each of them is a constant there — `initial`, `'idle'`, `false`, `undefined` — which any
 * backend can paint with.
 */
export interface Task<A, R, V = R | undefined> {
  /** The last answer that arrived, or `initial`. Kept while a new call is in flight. Tracked. */
  readonly value: Readable<V>;
  /** Tracked. */
  readonly state: Readable<TaskState>;
  /** `state() === 'pending'`. Tracked. */
  readonly pending: Readable<boolean>;
  /** What the last failed call rejected with; `undefined` unless state() is 'failed'. Tracked. */
  readonly error: Readable<unknown>;
  /** Starts a call by hand. Resolves with its answer, or `undefined` if it was cancelled, replaced or failed. Never rejects. */
  run(...args: A extends void ? [args?: A] : [args: A]): Promise<R | undefined>;
  /** Aborts the call in flight and drops the ones waiting. */
  cancel(): void;
}

/** How a call settled, without ever rejecting. */
type Outcome<R> = { readonly ok: true; readonly value: R } | { readonly ok: false; readonly error: unknown };

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

  /** Bumped by every call in `latest` and by every `cancel`: an older call never writes or resolves. */
  let generation = 0;
  /** Calls started and not yet settled or dropped. In `latest` only the current one counts. */
  let outstanding = 0;
  /** The controller of the call on the wire, if any. */
  let inFlight: AbortController | null = null;
  /** `queue`: what the next call waits for. */
  let tail: Promise<unknown> = Promise.resolve();
  /** The `run` promises of this generation that have not resolved yet. */
  const waiting = new Set<(answer: R | undefined) => void>();
  let disposed = false;

  /** Call `fn`. A synchronous throw becomes a rejection, and no outcome ever rejects. */
  const invoke = (args: A, controller: AbortController): Promise<Outcome<R>> => {
    inFlight = controller;
    return new Promise<R>((resolve) => {
      resolve(fn(args, { signal: controller.signal }));
    }).then(
      (answer): Outcome<R> => ({ ok: true, value: answer }),
      (reason: unknown): Outcome<R> => ({ ok: false, error: reason }),
    );
  };

  /** Write what one current call left, and close the round if it was the last one. */
  const settle = (outcome: Outcome<R>): R | undefined => {
    inFlight = null;
    outstanding -= 1;
    if (outcome.ok) {
      value.set(outcome.value);
    }
    if (outstanding === 0) {
      error.set(outcome.ok ? undefined : outcome.error);
      state.set(outcome.ok ? 'done' : 'failed');
    }
    return outcome.ok ? outcome.value : undefined;
  };

  /**
   * Forget every call of this generation: abort the one on the wire and resolve every `run`
   * with `undefined` NOW. Not when `fn` settles — a `fn` that ignores its signal may never
   * settle, and a replaced or cancelled `run` must not wait for it.
   */
  const drop = (): void => {
    generation += 1;
    outstanding = 0;
    inFlight?.abort();
    inFlight = null;
    // A call that ignores its abort must not hold back the ones that come after.
    tail = Promise.resolve();
    for (const resolve of waiting) {
      resolve(undefined);
    }
    waiting.clear();
  };

  const start = (args: A): Promise<R | undefined> => {
    if (disposed) {
      return Promise.resolve(undefined);
    }
    if (!queue) {
      drop();
    }
    error.set(undefined);
    state.set('pending');
    outstanding += 1;
    const mine = generation;
    return new Promise<R | undefined>((resolve) => {
      waiting.add(resolve);
      const call = async (): Promise<void> => {
        if (mine !== generation) {
          return;
        }
        const outcome = await invoke(args, new AbortController());
        if (mine !== generation) {
          return;
        }
        waiting.delete(resolve);
        resolve(settle(outcome));
      };
      if (queue) {
        tail = tail.then(call);
      } else {
        void call();
      }
    });
  };

  const cancel = (): void => {
    if (outstanding === 0) {
      return;
    }
    drop();
    state.set('cancelled');
  };

  let stop: (() => void) | null = null;
  if (source !== undefined) {
    // The first run only learns what `source` reads: creating a task never calls (§4.1).
    let first = true;
    stop = effect(() => {
      const args = source();
      if (first) {
        first = false;
        return;
      }
      // What `fn` reads is not something the task depends on.
      untrack(() => void start(args));
    });
  }

  own(() => {
    cancel();
    disposed = true;
    stop?.();
  });

  return {
    // Derived, so the writable signals stay the task's own and the reads are real sources.
    value: computed(() => value()),
    state: computed(() => state()),
    pending: computed(() => state() === 'pending'),
    error: computed(() => error()),
    run: (...args) => start(args[0] as A),
    cancel,
  };
}
