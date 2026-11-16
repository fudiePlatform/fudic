/**
 * The quiet page (SDD-82 §4.5): after each `when` and before each `then`, the workbench waits
 * until nothing the page started is still on its way — no request in flight (a fetch, an XHR, a
 * navigation, a resource, from the documents or from the Service Worker), no `setTimeout` due in
 * less than a second, no animation frame asked for — and it stays so for one frame. A `then` that
 * reads «there is no row» before the answer arrives would pass for the wrong reason.
 *
 * The requests are counted from outside, by the browser's context: it sees every document and
 * the worker. The timers and the frames from inside, by a script that runs before the page's
 * own. An open `EventSource` is no request on its way, and a `setInterval` is a clock: neither
 * counts. A request the bench holds forever (`later.never()`) does not either: the page waits
 * for it, and the criterion says so.
 */

/** Where the script keeps what it counts. Only in the measuring instance. */
const STATE = '__fudicBenchQuiet';

/** A timer due later than this is no part of what a gesture started: a `debounce` is shorter. */
export const SHORT_TIMER = 1000;

/** Init script: the page's short timers and its frames, counted from its first moment. */
export const QUIET = `(() => {
  const timers = new Set();
  const frames = new Set();
  const setT = globalThis.setTimeout, clearT = globalThis.clearTimeout;
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame;
  globalThis.${STATE} = { timers, frames, raf: raf.bind(globalThis) };
  globalThis.setTimeout = function (fn, ms, ...rest) {
    const id = setT.call(globalThis, (...args) => {
      timers.delete(id);
      return typeof fn === 'function' ? fn(...args) : (0, eval)(String(fn));
    }, ms, ...rest);
    if (!(Number(ms) >= ${SHORT_TIMER})) timers.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
    return clearT.call(globalThis, id);
  };
  globalThis.requestAnimationFrame = (fn) => {
    const id = raf.call(globalThis, (t) => {
      frames.delete(id);
      return fn(t);
    });
    frames.add(id);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    frames.delete(id);
    return caf.call(globalThis, id);
  };
})();`;

/** One look at the page: how many short timers and frames it has, after one frame of its own. */
export const LOOK = `() => new Promise((resolve) => {
  const state = globalThis.${STATE};
  // The browser's own error page (no network) animates for ever, and it is no page of the app.
  if (state === undefined || location.protocol === 'chrome-error:') return resolve({ timers: 0, frames: 0 });
  state.raf(() => resolve({ timers: state.timers.size, frames: state.frames.size }));
})`;

/** What one look found pending. */
export interface Pending {
  /** The requests in flight, each as `GET /path`. */
  readonly requests: readonly string[];
  readonly timers: number;
  readonly frames: number;
}

/** What the wait reads from the page: one look at a time. */
export interface QuietProbe {
  look(): Promise<Pending>;
  /** How many requests the bench is holding on purpose, never to answer them. */
  held(): number;
}

/** The page did not settle in time: what was still pending, as the diagnostic says it. */
export class Unsettled extends Error {
  override readonly name = 'Unsettled';
  constructor(
    readonly ms: number,
    readonly pending: readonly string[],
  ) {
    super(`the page did not settle in ${ms} ms; still pending: ${pending.join(', ')}`);
  }
}

/** What a look found, as the diagnostic lists it: `GET /a`, `2 timers`, `a frame`. */
export function describePending(pending: Pending, held: number): string[] {
  const requests = pending.requests.length > held ? pending.requests : [];
  const count = (n: number, one: string, many: string): string[] => (n === 0 ? [] : [n === 1 ? one : `${n} ${many}`]);
  return [...requests, ...count(pending.timers, 'a timer', 'timers'), ...count(pending.frames, 'a frame', 'frames')];
}

/** How many times `ms` a page that keeps finishing requests may take before it is called busy. */
export const QUIET_CAP = 6;

/** Whether a request pending in `before` is gone from `after`: one of them finished. */
function finishedOne(before: readonly string[], after: readonly string[]): boolean {
  const left = new Map<string, number>();
  for (const r of after) left.set(r, (left.get(r) ?? 0) + 1);
  return before.some((r) => {
    const n = left.get(r) ?? 0;
    left.set(r, n - 1);
    return n === 0;
  });
}

/**
 * Waits until the page is quiet twice in a row — two looks, a frame apart — and throws what was
 * still pending when it is not.
 *
 * `ms` is how long the page may go WITHOUT PROGRESS: each request that finishes gives it `ms` more.
 * The first visit to a route on the dev server is a stream of modules Vite transforms one after
 * another, and on a loaded machine that stream alone outlasts any fixed limit while nothing is
 * wrong with the page. A request that never ends, or a timer that rearms itself, makes no progress
 * and is reported after `ms`, as before. A page that keeps finishing requests and starting new ones
 * is reported after `ms × QUIET_CAP`.
 */
export async function waitQuiet(probe: QuietProbe, ms: number, now: () => number = Date.now): Promise<void> {
  const start = now();
  const cap = start + ms * QUIET_CAP;
  let until = start + ms;
  let quietLooks = 0;
  let before: readonly string[] = [];
  for (;;) {
    const pending = await probe.look();
    const left = describePending(pending, probe.held());
    quietLooks = left.length === 0 ? quietLooks + 1 : 0;
    if (quietLooks === 2) return;
    const at = now();
    if (finishedOne(before, pending.requests)) until = Math.min(at + ms, cap);
    before = pending.requests;
    if (at >= until) throw new Unsettled(at - start, left);
  }
}
