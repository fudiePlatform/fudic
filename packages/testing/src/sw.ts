/**
 * The simulated Service Worker (§3.6). With `sw: true`, `navigator.serviceWorker.controller`
 * is a worker that notes every `paths` it is told to invalidate and answers through the
 * `MessageChannel` it was handed, as the real one does once its caches are gone. Without it,
 * there is no controller, and a call does not wait for anybody.
 */

import { INVALIDATE_MESSAGE } from '@fudic/conventions';
import { track } from './pending.js';

/** The paths the simulated worker was told to invalidate, in order. */
const paths: string[] = [];

/** What the page's `invalidate` posts. */
interface InvalidateMessage {
  readonly type: string;
  readonly paths: readonly string[];
}

/** The port the worker answers through: Node's, which says when the page closes its end. */
type ReplyPort = MessagePort & { once(event: 'close', listener: () => void): void };

const worker = {
  postMessage(message: InvalidateMessage, transfer: readonly ReplyPort[]): void {
    if (message.type !== INVALIDATE_MESSAGE) return;
    paths.push(...message.paths);
    const port = transfer[0]!;
    // Pending until the page has read the answer and closed its end: the reply crosses a turn of
    // the event loop, and the call that waits for it resolves only after.
    track(new Promise<void>((resolve) => port.once('close', resolve)));
    port.postMessage({ type: INVALIDATE_MESSAGE });
  },
};

/** The paths invalidated so far. */
export function invalidated(): readonly string[] {
  return [...paths];
}

/** Put the simulated worker in control of the page, or take it away. */
export function controlWith(on: boolean): void {
  if (on) {
    Object.defineProperty(navigator, 'serviceWorker', { value: { controller: worker }, configurable: true });
  } else {
    Reflect.deleteProperty(navigator, 'serviceWorker');
  }
  paths.length = 0;
}
