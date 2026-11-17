/**
 * How a call that carries files goes out (SDD-81 §3.4, §4.1): as `multipart/form-data`, through
 * `XMLHttpRequest` — the one API of the browser that reports the progress of an upload in every
 * engine. A capability the generated module hands to `stub` only for a function whose arguments
 * reach a `file`: a page none of whose functions upload never downloads it.
 */

import type { Progress } from '../types.js';
import { splitFiles } from '../wire/files.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';
import { counted } from './send.js';

/** The part every call that carries files opens with: the rest of its arguments, in its format. */
export const ARGS_PART = '$args';

type Listener = ((progress: Progress | null) => void) | undefined;

/** What `stub` needs to send a call that carries files. */
export interface Upload {
  body(wire: Wire, types: Readonly<Record<string, Ty>>, args: Readonly<Record<string, unknown>>): FormData;
  send(url: URL, init: RequestInit & { readonly body: FormData; readonly signal: AbortSignal }, onProgress: Listener): Promise<Response>;
}

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

/** Through `XMLHttpRequest` where there is one; through `fetch` where there is none, as in a test. */
export const upload: Upload = {
  body: multipartBody,
  send: (url, init, onProgress) =>
    typeof XMLHttpRequest === 'function' ? viaXhr(url, init, onProgress) : fetch(url, init).then((r) => counted(r, onProgress)),
};
