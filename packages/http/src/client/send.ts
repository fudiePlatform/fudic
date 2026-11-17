/**
 * How a call goes out (SDD-81 §3.4, §4.1): through `fetch`, its download counted when someone
 * listens. A call that carries files goes through the `Upload` its module hands to `stub`
 * (`./upload.ts`), and the caller cannot tell them apart: both give a `Response`, both stop at
 * the signal.
 */

import type { Progress } from '../types.js';

type Listener = ((progress: Progress | null) => void) | undefined;

/**
 * The statuses whose response has no body (Fetch, «null body status»). A browser may still hand
 * one a `body` — an empty stream — and a `Response` rebuilt from it with that status is a
 * `TypeError`: a 204 of a `put` would fail on the way back.
 */
const NULL_BODY: ReadonlySet<number> = new Set([101, 103, 204, 205, 304]);

/** `response`, its body counted against its `content-length` as it is read. */
export function counted(response: Response, onProgress: Listener): Response {
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

/** The request, sent through `fetch`. The end of the progress, `null`, is the caller's to say. */
export function send(url: URL, init: RequestInit & { readonly signal: AbortSignal }, onProgress: Listener): Promise<Response> {
  return fetch(url, init).then((response) => counted(response, onProgress));
}
