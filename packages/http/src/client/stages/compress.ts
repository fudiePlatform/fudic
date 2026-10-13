/**
 * `compress`: the body, when the chain asks for it and it is worth it (SDD-56 §4.17). Two
 * guards: the encoded body reaches `min` bytes, and the compressed one is actually smaller —
 * otherwise the payload goes on as it came. A browser without `CompressionStream` is the same
 * branch: the stage does not exist there.
 */

import { isBytes, type Stage } from '../pipeline.js';
import type { CompressOptions } from '../../types.js';

const DEFAULT_MIN = 1000;
const utf8 = new TextEncoder();

const bytesOf = (v: unknown): Uint8Array<ArrayBuffer> =>
  isBytes(v) ? (v as Uint8Array<ArrayBuffer>) : utf8.encode(v as string);

export const compress: Stage = {
  name: 'compress',
  supported: () => typeof CompressionStream === 'function',
  applies: (p, call) =>
    call.compress !== false && bytesOf(p.value).length >= (call.compress.min ?? DEFAULT_MIN),
  apply: async (p, call) => {
    const { format } = call.compress as CompressOptions;
    const plain = bytesOf(p.value);
    const packed = new Uint8Array(
      await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream(format))).arrayBuffer(),
    );
    return packed.length < plain.length
      ? { ...p, value: packed, headers: { ...p.headers, 'content-encoding': format } }
      : p;
  },
};
