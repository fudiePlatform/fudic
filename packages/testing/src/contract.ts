/**
 * `@fudic/http/contract` as a test run sees it (SDD-60 §4.4, *decided while implementing*).
 *
 * In a vitest run one module graph is the server and the page at once, so a generated module
 * `fudic:<id>` exists once, in its server variant. A function of it has to be both things its
 * two variants are: what the page calls — the browser's stub, with its client halves, its codec
 * and its `fetch`, which the in-memory server answers — and what `src/server` completes with
 * `.handle`. Every generated module imports this file in place of the real entry.
 */

import { fn as serverFn, stub, type FnSpec, type ServerContract } from '@fudic/http/contract';

export * from '@fudic/http/contract';

/** A function of a `.fudapi`: the browser's call, with the server's `.handle` and slot. */
export function fn(spec: FnSpec): ServerContract {
  const server = serverFn(spec);
  return Object.assign(stub(spec), { spec: server.spec, slot: server.slot, handle: server.handle });
}
