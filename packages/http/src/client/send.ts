/**
 * How a call goes out (SDD-81 §3.4, §4.1): a call that carries files as `multipart/form-data`,
 * through `XMLHttpRequest` — the one API of the browser that reports the progress of an upload in
 * every engine — and anything else through `fetch`, its download counted when someone listens.
 * The caller cannot tell them apart: both give a `Response`, both stop at the signal.
 */

import type { Progress } from '../types.js';
import { splitFiles } from '../wire/files.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';

/** The part every call that carries files opens with: the rest of its arguments, in its format. */
export const ARGS_PART = '$args';

/** The body of a call that carries files: `$args` first, then each file by its path. */
export function multipartBody(wire: Wire, types: Readonly<Record<string, Ty>>, args: Readonly<Record<string, unknown>>): FormData {
  const { rest, files } = splitFiles(types, args);
  const form = new FormData();
  const encoded = wire.encodeArgs(types, rest) ?? '';
  form.append(ARGS_PART, new Blob([encoded as BlobPart], { type: wire.type }));
  // The browser reads each file from the disk as it sends it: none of them is in memory.
  for (const [path, file] of files) form.append(path, file, file.name);
  return form;
}

type Listener = ((progress: Progress | null) => void) | undefined;

/**
 * The statuses whose response has no body (Fetch, «null body status»). A browser may still hand
 * one a `body` — an empty stream — and a `Response` rebuilt from it with that status is a
 * `TypeError`: a 204 of a `put` would fail on the way back.
 */
const NULL_BODY: ReadonlySet<number> = new Set([101, 103, 204, 205, 304]);

/** `response`, its body counted against its `content-length` as it is read. */
function counted(response: Response, onProgress: Listener): Response {
  if (onProgress === undefined || response.body === null || NULL_BODY.has(response.status)) return response;
  const length = response.headers.get('content-length');
  const total = length === null ? null : Number(length);
  let loaded = 0;
  const body = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.length;
        onProgress({ loaded, total, phase: 'down' });
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/** The headers `getAllResponseHeaders` gives, as `Headers`. */
function headersOf(text: string): Headers {
  const headers = new Headers();
  for (const line of text.trim().split(/\r?\n/u)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return headers;
}

/** A multipart call through `XMLHttpRequest`, with the progress of both directions. */
function viaXhr(url: URL, init: RequestInit & { readonly body: FormData; readonly signal: AbortSignal }, onProgress: Listener): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method ?? 'POST', url.href);
    xhr.responseType = 'blob';
    new Headers(init.headers).forEach((value, name) => xhr.setRequestHeader(name, value));
    const abort = (): void => xhr.abort();
    if (init.signal.aborted) {
      reject(init.signal.reason);
      return;
    }
    init.signal.addEventListener('abort', abort, { once: true });
    if (onProgress !== undefined) {
      xhr.upload.onprogress = (e) => onProgress({ loaded: e.loaded, total: e.lengthComputable ? e.total : null, phase: 'up' });
      xhr.onprogress = (e) => onProgress({ loaded: e.loaded, total: e.lengthComputable ? e.total : null, phase: 'down' });
    }
    xhr.onload = () => {
      init.signal.removeEventListener('abort', abort);
      resolve(new Response(xhr.status === 204 ? null : (xhr.response as Blob), { status: xhr.status, statusText: xhr.statusText, headers: headersOf(xhr.getAllResponseHeaders()) }));
    };
    xhr.onerror = () => {
      init.signal.removeEventListener('abort', abort);
      reject(new TypeError('network error'));
    };
    xhr.onabort = () => {
      init.signal.removeEventListener('abort', abort);
      reject(init.signal.reason ?? new DOMException('The call was cancelled.', 'AbortError'));
    };
    xhr.send(init.body);
  });
}

/**
 * The request, sent: multipart through `XMLHttpRequest` where there is one, everything else (and
 * multipart where there is none, as in a test) through `fetch`. The end of the progress, `null`, is
 * the caller's to say once it has read the answer.
 */
export function send(url: URL, init: RequestInit & { readonly signal: AbortSignal }, onProgress: Listener): Promise<Response> {
  if (init.body instanceof FormData && typeof XMLHttpRequest === 'function') {
    return viaXhr(url, init as RequestInit & { readonly body: FormData; readonly signal: AbortSignal }, onProgress);
  }
  return fetch(url, init).then((response) => counted(response, onProgress));
}
