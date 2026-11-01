import { type PageMaps } from './maps.js';

/** Hosts of a page streamed in parts, waiting for the part that carries their state. */
export interface Arrivals {
  /** Whether the last part is in. Always true for a page read whole. */
  readonly finished: boolean;
  /** Settles once the last part is in. */
  readonly done: Promise<void>;
  /** What host `id` has to wait for, or `null` when its state is already in. */
  until(id: number): Promise<void> | null;
  /** A part arrived: wakes the hosts whose state it carried. */
  wake(): void;
  /** The last part arrived: wakes everyone still waiting. */
  finish(): void;
}

export function createArrivals(maps: PageMaps, inParts: boolean): Arrivals {
  let finished = !inParts;
  let waiting: { readonly id: number; readonly wake: () => void }[] = [];
  // Assigned whenever the page is in parts, the only case `finish` is called.
  let markDone!: () => void;
  const done = finished
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        markDone = resolve;
      });

  const wake = (): void => {
    const still = waiting.filter((w) => !finished && w.id >= maps.count);
    for (const w of waiting) if (!still.includes(w)) w.wake();
    waiting = still;
  };

  return {
    get finished() {
      return finished;
    },
    done,
    until(id) {
      if (finished || id < maps.count) return null;
      return new Promise((resolve) => {
        waiting.push({ id, wake: resolve });
      });
    },
    wake,
    finish() {
      finished = true;
      wake();
      markDone();
    },
  };
}
