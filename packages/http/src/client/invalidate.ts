/**
 * After a call that changed something, the data the Service Worker keeps for it is stale
 * (SDD-56 §4.9). The call does not resolve until the worker confirms, or a
 * `location.assign` right after the `await` could paint the old data.
 *
 * Without a worker controlling the page there is nothing cached, and nothing to wait for.
 */

import { INVALIDATE_MESSAGE } from '@fudic/conventions';

export interface InvalidateMessage {
  readonly type: typeof INVALIDATE_MESSAGE;
  /** Concrete paths or route patterns, `base` included. */
  readonly paths: readonly string[];
}

export function invalidate(paths: readonly string[]): Promise<void> {
  const worker = globalThis.navigator?.serviceWorker?.controller;
  if (worker == null || paths.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    const message: InvalidateMessage = { type: INVALIDATE_MESSAGE, paths };
    worker.postMessage(message, [channel.port2]);
  });
}
