// What a page only needs once something hydrates: the DOM adapter components paint with, and
// the signal their state is made of. They are imported here, inside the published runtime,
// because a dynamic import in application code makes the bundler inject its preload helper
// into the module every page loads. `import type` leaves no request behind.
import type { DomClient } from '@fudic/dom';
import type { signal } from '../signal.js';

export interface DeferredPieces {
  readonly dom: DomClient<Node>;
  readonly signal: typeof signal;
}

export type ImportDeferred = () => Promise<DeferredPieces>;

// One batch: two awaits in a row would be two round trips.
export const importDeferred: ImportDeferred = async () => {
  const [dom, signal] = await Promise.all([import('@fudic/dom'), import('../signal.js')]);
  return { dom: dom.browserDom, signal: signal.signal };
};

/**
 * One request however many callers ask: the warm channel and the first gesture share it.
 * A failure is forgotten, so the next caller asks again.
 */
export function deferredOnce(load: ImportDeferred): ImportDeferred {
  let pending: Promise<DeferredPieces> | null = null;
  return () => {
    if (pending === null) {
      pending = load();
      pending.catch(() => {
        pending = null;
      });
    }
    return pending;
  };
}
