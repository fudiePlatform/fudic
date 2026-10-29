/**
 * After a call that changed something, the data the Service Worker keeps for it is stale
 * (SDD-56 §4.9). The call does not resolve until the worker confirms, or a
 * `location.assign` right after the `await` could paint the old data.
 *
 * Without a worker controlling the page there is nothing cached, and nothing to wait for.
 */

import { coversPath, DATA_STALE_EVENT, INVALIDATE_MESSAGE, type DataStaleDetail } from '@fudic/conventions';

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

/**
 * Tell the page its own data is stale, when it is among `paths` (SDD-68 §4.8): concrete or by
 * pattern, with the comparison the worker uses. The route's chunk listens, asks for its `data`
 * again and repaints, and hands that work over with `wait` — the call resolves after it, so the
 * code after the `await` sees the page up to date.
 *
 * Nobody listening is not an error: a page without a refreshable route resolves as before. And
 * a call made where there is no document — a worker — has no page to tell.
 */
export async function announceStale(paths: readonly string[]): Promise<void> {
  const doc = globalThis.document as Document | undefined;
  const here = globalThis.location.pathname;
  if (doc === undefined || !paths.some((path) => coversPath(path, here))) return;
  const pending: Promise<void>[] = [];
  const detail: DataStaleDetail = { paths, wait: (done) => void pending.push(done) };
  doc.dispatchEvent(new CustomEvent(DATA_STALE_EVENT, { detail }));
  await Promise.all(pending);
}
