/**
 * The preview compresses what it serves, as the host of a deployed app does (finding 1 of the
 * website): brotli or gzip, negotiated request by request from `Accept-Encoding`, with
 * `Vary: Accept-Encoding`. Without it, a local Lighthouse run measures pages that no host would
 * ever send, and flags `uses-text-compression`.
 *
 * Only the preview: compression is the transport's, and the host does it in production. Nothing is
 * compressed ahead of time either: no `.br` or `.gz` beside the build.
 *
 * It is a Connect middleware that goes first, so it wraps every answer behind it: the pages of
 * `@fudic/server` and the files Vite serves. It decides when the headers go out (`writeHead`, or
 * the first `write`/`end`): a compressible type, no `Content-Encoding` yet, no `no-transform`, a
 * status with a whole body, and not a body known to be under {@link MIN_SIZE}. A streamed page
 * (a `later` field) keeps streaming: every chunk is flushed through the compressor as it comes.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { constants, createBrotliCompress, createGzip, type BrotliCompress, type Gzip } from 'node:zlib';

/** The encodings the preview answers with, in the order it prefers them. */
export type Encoding = 'br' | 'gzip';

/**
 * Brotli's quality on the fly. Its default, 11, is for files compressed once: on a 37 KB page it
 * takes some 50 ms, more than the transfer it saves. Hosts compress on the fly at 4 or 5.
 */
export const BROTLI_QUALITY = 5;

/** Under this many bytes, compressing costs more than it saves. */
export const MIN_SIZE = 1024;

/** Text the browser decodes: what is worth compressing. A font or an image is compressed already. */
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|x-javascript|json|manifest\+json|ld\+json|xml)|image\/svg\+xml)/iu;

/**
 * The encoding to answer with, from an `Accept-Encoding` header: the one with the highest `q`,
 * brotli on a tie; a `*` stands for any not named; `q=0` refuses. None when neither is accepted.
 */
export function negotiate(header: string | undefined): Encoding | undefined {
  if (header === undefined) return undefined;
  const weights = new Map<string, number>();
  for (const part of header.split(',')) {
    const [name = '', ...params] = part.split(';').map((piece) => piece.trim().toLowerCase());
    const q = params.find((param) => param.startsWith('q='));
    const weight = q === undefined ? 1 : Number(q.slice(2));
    weights.set(name, Number.isNaN(weight) ? 0 : weight);
  }
  const weightOf = (encoding: Encoding): number => weights.get(encoding) ?? weights.get('*') ?? 0;
  const br = weightOf('br');
  const gzip = weightOf('gzip');
  if (br <= 0 && gzip <= 0) return undefined;
  return br >= gzip ? 'br' : 'gzip';
}

/** The headers of a `writeHead` call, an object or a flat list, set on `res` one by one. */
function setAll(res: ServerResponse, headers: unknown): void {
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) res.setHeader(String(headers[i]), headers[i + 1] as string);
    return;
  }
  for (const [name, value] of Object.entries(headers as Record<string, string | number | readonly string[] | undefined>)) {
    if (value !== undefined) res.setHeader(name, value);
  }
}

/** `Accept-Encoding` added to `Vary`, kept with what was there. */
function varyOnEncoding(res: ServerResponse): void {
  const vary = res.getHeader('vary');
  const names = vary === undefined ? [] : String(vary).split(',').map((name) => name.trim());
  if (names.some((name) => name === '*' || name.toLowerCase() === 'accept-encoding')) return;
  res.setHeader('vary', [...names, 'Accept-Encoding'].join(', '));
}

/** Whether the response, as its headers stand, is one the preview compresses (`encoding` aside). */
function compressible(res: ServerResponse): boolean {
  const status = res.statusCode;
  if (status === 204 || status === 206 || status === 304) return false;
  if (!COMPRESSIBLE.test(String(res.getHeader('content-type') ?? ''))) return false;
  if (res.getHeader('content-encoding') !== undefined) return false;
  return !/\bno-transform\b/iu.test(String(res.getHeader('cache-control') ?? ''));
}

/** A chunk of `write` or `end` as bytes. */
function bytes(chunk: string | Uint8Array, encoding: BufferEncoding | undefined): Buffer {
  return typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk);
}

type Callback = (error?: Error | null) => void;
type Write = (chunk: string | Uint8Array, encoding?: BufferEncoding | Callback, callback?: Callback) => boolean;
type End = (chunk?: string | Uint8Array | Callback, encoding?: BufferEncoding | Callback, callback?: Callback) => ServerResponse;

/** The optional `encoding` and `callback` of `write`/`end`, apart. */
function rest(encoding: BufferEncoding | Callback | undefined, callback: Callback | undefined): { encoding?: BufferEncoding; callback?: Callback } {
  if (typeof encoding === 'function') return { callback: encoding };
  return { ...(encoding === undefined ? {} : { encoding }), ...(callback === undefined ? {} : { callback }) };
}

/** The middleware. */
export function compression(): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return (req, res, next) => {
    const encoding = negotiate(req.headers['accept-encoding']);
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
    const write = res.write.bind(res) as Write;
    const end = res.end.bind(res) as End;
    let decided = false;
    let stream: BrotliCompress | Gzip | undefined;

    /** Once, when the headers go out: compress or not, from what they say. */
    const decide = (): void => {
      decided = true;
      if (!compressible(res)) return;
      varyOnEncoding(res);
      const length = res.getHeader('content-length');
      if (encoding === undefined || (length !== undefined && Number(length) < MIN_SIZE)) return;
      res.setHeader('content-encoding', encoding);
      res.removeHeader('content-length');
      // The bytes are no longer the ones a strong validator names.
      const etag = res.getHeader('etag');
      if (typeof etag === 'string' && etag.startsWith('"')) res.setHeader('etag', `W/${etag}`);
      const compressor = encoding === 'br' ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY } }) : createGzip();
      compressor.on('data', (chunk: Buffer) => write(chunk));
      compressor.on('end', () => end());
      res.on('close', () => compressor.destroy());
      stream = compressor;
    };

    res.writeHead = ((status: number, ...args: unknown[]) => {
      const message = typeof args[0] === 'string' ? args[0] : undefined;
      const headers = message === undefined ? args[0] : args[1];
      if (headers !== undefined) setAll(res, headers);
      res.statusCode = status;
      if (!decided) decide();
      return message === undefined ? writeHead(status) : writeHead(status, message);
    }) as ServerResponse['writeHead'];

    res.write = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | Callback, callback?: Callback) => {
      if (!decided) res.writeHead(res.statusCode);
      if (stream === undefined) return write(chunk, encodingOrCallback, callback);
      const { encoding: chunkEncoding, callback: done } = rest(encodingOrCallback, callback);
      stream.write(bytes(chunk, chunkEncoding));
      // A streamed page goes out as it comes: what the compressor holds is flushed every chunk.
      stream.flush();
      done?.();
      return true;
    }) as ServerResponse['write'];

    res.end = ((chunk?: string | Uint8Array | Callback, encodingOrCallback?: BufferEncoding | Callback, callback?: Callback) => {
      const body = typeof chunk === 'function' ? undefined : chunk;
      const { encoding: chunkEncoding, callback: done } = typeof chunk === 'function' ? { callback: chunk } : rest(encodingOrCallback, callback);
      if (!decided) {
        // A body given whole is a body of known size: under the threshold it goes as it is.
        if (body !== undefined && !res.hasHeader('content-length')) res.setHeader('content-length', bytes(body, chunkEncoding).length);
        res.writeHead(res.statusCode);
      }
      if (stream === undefined) return end(body as string | Uint8Array, chunkEncoding as BufferEncoding, done);
      if (done !== undefined) res.once('finish', () => done());
      if (body !== undefined) stream.write(bytes(body, chunkEncoding));
      stream.end();
      return res;
    }) as ServerResponse['end'];

    next();
  };
}
