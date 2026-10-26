/**
 * A browser and a server in one process, for the upload pipeline: `fetch` hands the very
 * `Request` the stub built to the dispatcher, and keeps a copy of what crossed the wire — its
 * headers and its bytes — so a test can look at the cable as Network would.
 *
 * One function, `save` of `components/x`, both variants: the call (`stub`) and the contract the
 * server completes (`fn`). Each `serve` declares it again, and the dispatcher finds the last.
 */

import { vi } from 'vitest';
import { fn, stub, type FnSpec } from '../../src/contract/index.js';
import { contractsHandler } from '../../src/contract/server.js';

export interface Wire {
  readonly headers: Headers;
  readonly bytes: Uint8Array;
  /** The body as text, for the bodies that are text. */
  readonly text: string;
}

const URL_SAVE = 'https://app.test/_fudic/fn/components/x/save';

/** What changes from one function to the next: its form, its arguments, its chain. */
export type Over = Partial<Omit<FnSpec, 'id' | 'name'>>;

/** A `ctx` as a handler of these tests reads it, loosely. */
export type Ctx = { readonly args: any; readonly form: any };

const spec = (over: Over): FnSpec => ({ id: 'components/x', name: 'save', method: 'PUT', chain: [], ...over });

export function browser(): void {
  vi.stubGlobal('location', { origin: 'https://app.test', pathname: '/usuarios' });
}

/** The server side of `save`: declared with `over` and implemented by `handler`. */
function declare(handler: (ctx: Ctx) => unknown, over: Over): void {
  fn(spec(over)).handle(handler as never);
}

/** Serves `save` and records every request it receives. */
export function serve(handler: (ctx: Ctx) => unknown, over: Over = {}): Wire[] {
  declare(handler, over);
  const handle = contractsHandler();
  const wire: Wire[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const request = new Request(url, init);
    const bytes = new Uint8Array(await request.clone().arrayBuffer());
    wire.push({ headers: request.headers, bytes, text: new TextDecoder().decode(bytes) });
    return handle(request);
  });
  return wire;
}

/** The browser side of `save`. */
export const call = (over: Over = {}) => stub<never, unknown, unknown>(spec(over));

/** A request straight to the dispatcher, as something that is not the stub would send it. */
export function raw(handler: (ctx: Ctx) => unknown, over: Over, body: BodyInit, headers: Record<string, string>) {
  declare(handler, over);
  return contractsHandler()(new Request(URL_SAVE, { method: 'PUT', body, headers })) as Promise<Response>;
}
