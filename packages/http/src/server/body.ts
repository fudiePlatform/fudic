/**
 * The body of a call, with the upload pipeline undone (SDD-56 §4.19): decompressed by its
 * `content-encoding`, then read by its `content-type`. Whatever form it came in, the
 * validation of `.form` receives the same `args`: the wire format never touches it.
 */

import type { AnyForm } from '@fudic/forms';
import { readBinary, reviveJson } from '@fudic/forms/wire';
import { badRequest, HttpError } from '../errors.js';

const ENCODINGS: ReadonlySet<string> = new Set(['gzip', 'deflate', 'deflate-raw']);

const unsupported = (detail: string): HttpError =>
  new HttpError({ status: 415, title: 'Unsupported Media Type', detail });

/** The arguments a non-GET request carries; `undefined` for an empty body. */
export async function bodyArgs(request: Request, form: AnyForm | undefined): Promise<unknown> {
  const bytes = await decoded(request);
  if (bytes.length === 0) return undefined;
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim();

  // With its keys, to a function with `.form`: its dates come back as `Date`, as they do on
  // the two positional roads, so the three reach `$set` alike (criterion 42).
  if (type === 'application/json') return form === undefined ? parse(bytes) : reviveJson(form.$schema, parse(bytes));
  if (type !== 'application/fud' && type !== 'application/fud+bin') {
    throw unsupported(`content-type "${type}"`);
  }
  if (form === undefined) throw badRequest('a positional body needs a function with .form');
  if (type === 'application/fud') return reviveJson(form.$schema, parse(bytes));
  try {
    return readBinary(form.$schema, bytes);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
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

function parse(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw badRequest('the body is not valid JSON');
  }
}
