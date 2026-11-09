/**
 * A call that carries files, received (SDD-81 §3.5, §4.2): its `$args` part in the function's
 * format, then each file in the part its path names, each counted against its limit as it
 * arrives and handed to the adapter's `Spool`.
 *
 * Every limit is checked while reading: the byte that passes it stops the read and answers `413`,
 * naming the limit and the field. What comes after is never read.
 */

import { HttpError, badRequest, forbidden } from '../errors.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';
import { fileSlotAt, joinFiles } from '../wire/files.js';
import { boundaryOf, readParts, type Part } from './multipart.js';
import type { Spool, UploadLimits } from './uploads.js';

const MB = 1024 * 1024;

/** 10 MB a file, 20 files, 1 MB of `$args`: what any HTTP server limits, all changeable. */
export const DEFAULT_LIMITS: UploadLimits = { maxFileSize: 10 * MB, maxFiles: 20, maxArgs: 1 * MB };

/** The part every call that carries files opens with. */
export const ARGS_PART = '$args';

const tooLarge = (detail: string): HttpError => new HttpError({ status: 413, title: 'Content Too Large', detail });

/** In memory: portable, the default. What it kept goes with the request. */
export function memorySpool(): Spool {
  return {
    put: async (bytes, meta) => new File([await new Response(bytes).blob()], meta.name, { type: meta.type }),
    release: () => Promise.resolve(),
  };
}

/**
 * A call that carries files from another site is refused, whatever its chain says (SDD-81 §3.13):
 * a `<form>` of any page can send `multipart/form-data`, which no format of ours let it before.
 */
export function refuseCrossSite(request: Request, url: URL): void {
  const site = request.headers.get('sec-fetch-site');
  const origin = request.headers.get('origin');
  if ((site !== null && site !== 'same-origin') || (origin !== null && origin !== url.origin)) {
    throw forbidden('cross-site request');
  }
}

/** `stream`, refused with a `413` at the byte that passes `limit`. */
function counted(stream: ReadableStream<Uint8Array>, limit: number, what: string): ReadableStream<Uint8Array> {
  let seen = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.length;
        if (seen > limit) controller.error(tooLarge(`${what} is larger than ${limit} bytes`));
        else controller.enqueue(chunk);
      },
    }),
  );
}

/** A part read whole, up to `limit` bytes. */
async function whole(part: Part, limit: number, what: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(counted(part.body, limit, what)).arrayBuffer());
}

export interface Received {
  readonly limits: UploadLimits;
  /** The `max-size` of each file slot that declares one, by path. */
  readonly fileLimits?: Readonly<Record<string, number>>;
}

/** The limit of the part at `path`: its `max-size`, or that of its list, or `maxFileSize`. */
function limitOf(path: string, received: Received): number {
  const own = received.fileLimits?.[path] ?? received.fileLimits?.[path.replace(/\.\d+$/u, '')];
  return own ?? received.limits.maxFileSize;
}

/**
 * The arguments of a multipart call, with every file in its place, each one the `File` the spool
 * gave back. Whatever goes wrong is an `HttpError`: `415` for another content type, `400` for a
 * malformed body or a part where no file goes, `413` for a limit.
 */
export async function multipartArgs(
  request: Request,
  wire: Wire,
  types: Readonly<Record<string, Ty>>,
  received: Received,
  spool: Spool,
): Promise<Record<string, unknown>> {
  const boundary = boundaryOf(request.headers.get('content-type'));
  if (boundary === undefined) {
    throw new HttpError({ status: 415, title: 'Unsupported Media Type', detail: 'a call that carries files is multipart/form-data' });
  }
  if (request.body === null) throw badRequest('multipart body: empty');
  let rest: Record<string, unknown> | undefined;
  const files = new Map<string, File>();
  for await (const part of readParts(request.body, boundary)) {
    if (rest === undefined) {
      if (part.name !== ARGS_PART) throw badRequest(`multipart body: the first part is "${part.name}", not ${ARGS_PART}`);
      const type = part.type.split(';')[0]!.trim();
      if (type !== wire.type) throw new HttpError({ status: 415, title: 'Unsupported Media Type', detail: `${ARGS_PART} is "${type}"` });
      const bytes = await whole(part, received.limits.maxArgs, ARGS_PART);
      rest = bytes.length === 0 ? {} : wire.decodeArgs(types, bytes);
      continue;
    }
    if (!fileSlotAt(types, part.name)) throw badRequest(`multipart body: no file goes at "${part.name}"`);
    if (files.has(part.name)) throw badRequest(`multipart body: two parts at "${part.name}"`);
    if (files.size >= received.limits.maxFiles) throw tooLarge(`more than ${received.limits.maxFiles} files`);
    const limit = limitOf(part.name, received);
    files.set(part.name, await spool.put(counted(part.body, limit, `file "${part.name}"`), { name: part.filename ?? '', type: part.type }));
  }
  if (rest === undefined) throw badRequest(`multipart body: no ${ARGS_PART} part`);
  return joinFiles(types, rest, files);
}

/**
 * `response`, whose spool is released once its body is done, cancelled or failed — or at once
 * when it has none. On any runtime: the body says when, not an event of a server.
 */
export function releasing(response: Response, spool: Spool): Response {
  if (response.body === null) {
    void spool.release();
    return response;
  }
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    void spool.release();
  };
  const reader = response.body.getReader();
  const out = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          release();
          controller.close();
        } else controller.enqueue(value);
      } catch (error) {
        release();
        controller.error(error);
      }
    },
    cancel(reason) {
      release();
      return reader.cancel(reason);
    },
  });
  return new Response(out, { status: response.status, statusText: response.statusText, headers: response.headers });
}
