/**
 * Byte-stream serialization (SDD-16 §3.1, §4.2). `htmlToByteStream` is the seam
 * the emit's `async function*` inherits: any (sync or async) sequence of HTML
 * text pieces becomes a UTF-8 `ReadableStream<Uint8Array>` with platform
 * backpressure. `renderToStream` is that seam applied to the shared tree walk.
 */

import { type SsrNode } from './tree.js';
import { serializeChunks } from './serialize.js';

export interface StreamOptions {
  /** Min bytes buffered before an enqueue, to coalesce tiny pieces. Default 8192. */
  highWaterMark?: number;
}

const DEFAULT_HIGH_WATER_MARK = 8192;

/**
 * Turn a (sync OR async) sequence of HTML text pieces into a UTF-8 byte stream.
 * Pull-based: each `pull` advances the iterator, coalescing pieces up to
 * `highWaterMark` bytes per enqueue, and yields when `desiredSize <= 0`.
 * `cancel()` closes the source iterator (`return()`). Each piece is encoded
 * whole, so a multi-byte code point never splits across chunks.
 */
export function htmlToByteStream(
  source: Iterable<string> | AsyncIterable<string>,
  options?: StreamOptions,
): ReadableStream<Uint8Array> {
  const minBytes = options?.highWaterMark ?? DEFAULT_HIGH_WATER_MARK;
  const iterator =
    Symbol.asyncIterator in source
      ? source[Symbol.asyncIterator]()
      : source[Symbol.iterator]();
  const encoder = new TextEncoder();

  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let exhausted = false;

  const flush = (controller: ReadableStreamDefaultController<Uint8Array>): void => {
    if (pendingBytes === 0) {
      return;
    }
    const out = new Uint8Array(pendingBytes);
    let offset = 0;
    for (const part of pending) {
      out.set(part, offset);
      offset += part.length;
    }
    pending = [];
    pendingBytes = 0;
    controller.enqueue(out);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      // desiredSize is only null on an errored stream, and pull is never called there.
      while (!exhausted && (controller.desiredSize as number) > 0) {
        const step = await iterator.next();
        if (step.done === true) {
          exhausted = true;
          break;
        }
        const bytes = encoder.encode(step.value);
        pending.push(bytes);
        pendingBytes += bytes.length;
        if (pendingBytes >= minBytes) {
          flush(controller);
        }
      }
      if (exhausted) {
        flush(controller);
        controller.close();
      }
    },
    async cancel(): Promise<void> {
      await iterator.return?.();
    },
  });
}

/**
 * Serialize a tree to a byte stream, lazily: the walk advances on `pull`.
 * Equivalent bytes to `new TextEncoder().encode(renderToString(root))`, produced
 * incrementally with a bounded memory ceiling.
 */
export function renderToStream(
  root: SsrNode,
  options?: StreamOptions,
): ReadableStream<Uint8Array> {
  return htmlToByteStream(serializeChunks(root), options);
}
