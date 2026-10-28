/**
 * The body of a call, with the upload pipeline undone (SDD-56 §4.19, SDD-67 §4.1): decompressed
 * by its `content-encoding`, then read in the function's own format, which its `content-type`
 * must name. There is no second door: a body in another format is a 415.
 */

import { badRequest, HttpError } from '../errors.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';

const ENCODINGS: ReadonlySet<string> = new Set(['gzip', 'deflate', 'deflate-raw']);

const unsupported = (detail: string): HttpError =>
  new HttpError({ status: 415, title: 'Unsupported Media Type', detail });

/** The arguments a non-GET request carries; none for an empty body. */
export async function bodyArgs(request: Request, wire: Wire, types: Readonly<Record<string, Ty>>): Promise<Record<string, unknown>> {
  const bytes = await decoded(request);
  if (bytes.length === 0) return {};
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim();
  if (type !== wire.type) throw unsupported(`content-type "${type}"`);
  return wire.decodeArgs(types, bytes);
}

async function decoded(request: Request): Promise<Uint8Array> {
  const encoding = request.headers.get('content-encoding');
  if (encoding === null) return new Uint8Array(await request.arrayBuffer());
  if (!ENCODINGS.has(encoding)) throw unsupported(`content-encoding "${encoding}"`);
  const stream = (request.body as ReadableStream<Uint8Array<ArrayBuffer>>).pipeThrough(
    new DecompressionStream(encoding as CompressionFormat),
  );
  try {
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw badRequest(`the body is not valid ${encoding}`);
  }
}
