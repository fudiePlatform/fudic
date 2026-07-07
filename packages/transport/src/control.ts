/**
 * The control bus (SDD-16 §4.3): out-of-band signals over a `BroadcastChannel`,
 * because they interest all three threads at once and do not follow the
 * request-response cycle. Control NEVER travels on a data `MessagePort` — an
 * invalidation must not queue behind a half-emitted stream.
 */

import { type ControlMessage } from './messages.js';

export interface ControlBus {
  post(msg: ControlMessage): void;
  on(fn: (msg: ControlMessage) => void): () => void; // returns unsubscribe
  close(): void;
}

export function controlBus(channelName = 'fudic'): ControlBus {
  const channel = new BroadcastChannel(channelName);
  return {
    post(msg: ControlMessage): void {
      channel.postMessage(msg);
    },
    on(fn: (msg: ControlMessage) => void): () => void {
      const listener = (e: MessageEvent): void => {
        fn(e.data as ControlMessage);
      };
      channel.addEventListener('message', listener);
      return () => {
        channel.removeEventListener('message', listener);
      };
    },
    close(): void {
      channel.close();
    },
  };
}
