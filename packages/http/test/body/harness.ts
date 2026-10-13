/**
 * A browser and a server in one process, for the upload pipeline: `fetch` hands the very
 * `Request` the stub built to `dispatch`, and keeps a copy of what crossed the wire — its
 * headers and its bytes — so a test can look at the cable as Network would.
 */

import { vi } from 'vitest';
import type { ChainBuilder } from '../../src/chain.js';
import type { ServerFn } from '../../src/builder.js';
import { dispatch } from '../../src/server/dispatch.js';

export interface Wire {
  readonly headers: Headers;
  readonly bytes: Uint8Array;
  /** The body as text, for the bodies that are text. */
  readonly text: string;
}

export function browser(): void {
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/usuarios' });
}

/** Serves `fn` (with `global` as `src/http.ts`) and records every request it receives. */
export function serve(fn: ServerFn<unknown, unknown>, global?: ChainBuilder): Wire[] {
  const wire: Wire[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const request = new Request(url, init);
    const bytes = new Uint8Array(await request.clone().arrayBuffer());
    wire.push({ headers: request.headers, bytes, text: new TextDecoder().decode(bytes) });
    return dispatch(request, { name: 'save', fn, params: {}, ...(global !== undefined ? { global } : {}) });
  });
  return wire;
}

/** A request straight to `dispatch`, as something that is not the stub would send it. */
export function raw(fn: ServerFn<unknown, unknown>, body: BodyInit, headers: Record<string, string>) {
  return dispatch(new Request('https://app.test/_fudic/fn/c/x/save', { method: 'PUT', body, headers }), {
    name: 'save',
    fn,
    params: {},
  });
}
