/**
 * A `Response` as the server of a function would send it (SDD-67 §3.7), for the `fetch` option
 * of a test that answers by hand. A call reads its answer in its function's own format — binary
 * unless its chain has `use json` — so a `Response.json(…)` is not one it understands.
 *
 * Both read the function's `FnSpec`, which its call carries in `spec`.
 */

import type { FnSpec } from '@fudic/http/contract';
import type { Problem, ServerFunction } from '@fudic/http';

const specOf = (fn: ServerFunction<never, unknown>): FnSpec => (fn as unknown as { readonly spec: FnSpec }).spec;

/** The value, in the function's format; a 204 for a function without `->` or an `undefined` value. */
export function respond<R>(fn: ServerFunction<never, R>, value: R, init: ResponseInit = {}): Response {
  const { wire, returns } = specOf(fn as ServerFunction<never, unknown>);
  if (returns === undefined || value === undefined) return new Response(null, { ...init, status: 204 });
  const headers = new Headers(init.headers);
  headers.set('content-type', wire.type);
  return new Response(wire.encodeValue(returns, value) as BodyInit, { status: 200, ...init, headers });
}

/** A failure, in the function's format, with the problem's status. */
export function respondProblem(fn: ServerFunction<never, unknown>, problem: Problem): Response {
  const { wire } = specOf(fn);
  return new Response(wire.encodeProblem(problem) as BodyInit, {
    status: problem.status,
    headers: { 'content-type': wire.problemType },
  });
}
