/**
 * What is still running on account of the test (§4.7): the chunks hydration is importing
 * today, and the requests to the in-memory server once there is one.
 *
 * There is no fixed wait anywhere. `settled` waits for every tracked promise, then lets the
 * microtasks they queued run out — one turn of the event loop, which ends when they have —
 * and starts again if any of them tracked something new.
 */

const inflight = new Set<Promise<unknown>>();

/** Count `work` as pending until it settles, either way. Hands it back untouched. */
export function track<T>(work: Promise<T>): Promise<T> {
  inflight.add(work);
  const done = (): void => {
    inflight.delete(work);
  };
  work.then(done, done);
  return work;
}

/** One turn of the event loop: every microtask queued before it has run when it resolves. */
function turn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

/** Resolve when nothing tracked is running and the microtasks it queued have run out. */
export async function settled(): Promise<void> {
  do {
    await Promise.allSettled([...inflight]);
    await turn();
  } while (inflight.size > 0);
}
