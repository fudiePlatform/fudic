/**
 * The transport adapter (SDD-16 §4.4): the ONLY point that knows there are two
 * ways to move a render across the WW→SW boundary. Native: transfer the
 * `ReadableStream` whole (platform backpressure for free). Degraded (stable
 * Safari throws `DataCloneError` on stream transfer): fan the stream out as
 * `ArrayBuffer` chunks and reassemble on the other side. The day old Safari
 * stops mattering, the degraded branch deletes cleanly.
 */

import { type RenderMessage } from './messages.js';

/** Probe CAPABILITY (not user-agent): can a `ReadableStream` be transferred? */
export function canTransferStream(): boolean {
  const probe = new ReadableStream();
  try {
    structuredClone(probe, { transfer: [probe] });
    return true;
  } catch {
    return false;
  }
}

/**
 * WW→SW: native transfer if able, else read the stream and fan out chunks.
 * `transferStream` is injectable for tests; production probes once at startup.
 */
export function sendRender(
  port: MessagePort,
  stream: ReadableStream<Uint8Array>,
  transferStream: boolean = canTransferStream(),
): void {
  if (transferStream) {
    port.postMessage({ type: 'stream', stream } satisfies RenderMessage, [stream]);
    return;
  }
  void fanOut(port, stream);
}

async function fanOut(port: MessagePort, stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      // Transfer a trimmed COPY: the TextEncoder may reuse its backing store
      // between chunks, and detaching the raw buffer would corrupt the next ones.
      const buffer = value.slice().buffer;
      port.postMessage({ type: 'chunk', buffer } satisfies RenderMessage, [buffer]);
    }
  } catch {
    // A failing source still terminates the protocol; the error signal is
    // control-channel business, not data-channel business.
  }
  port.postMessage({ type: 'end' } satisfies RenderMessage);
}

/**
 * SW side: reconstruct a stream from the FIRST message. Native: it IS the
 * stream. Degraded: process `first` (enqueue/close) BEFORE wiring
 * `port.onmessage` for the rest — same-task reassignment loses no queued
 * messages, and the first one is never dropped.
 */
export function receiveRender(port: MessagePort, first: RenderMessage): ReadableStream<Uint8Array> {
  if (first.type === 'stream') {
    return first.stream;
  }
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      const accept = (msg: RenderMessage): void => {
        if (msg.type === 'chunk') {
          controller.enqueue(new Uint8Array(msg.buffer));
          return;
        }
        // Only 'chunk' or 'end' ever travel on the degraded path.
        port.onmessage = null;
        controller.close();
      };
      accept(first);
      if (first.type !== 'end') {
        port.onmessage = (e: MessageEvent): void => {
          accept(e.data as RenderMessage);
        };
      }
    },
  });
}
