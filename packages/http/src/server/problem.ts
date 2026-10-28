/**
 * An error, as the response that carries it (SDD-56 §4.6, step 6; SDD-67 §3.2).
 *
 * An `HttpError` goes out with its status and its `Problem`. Anything else is a 500 whose
 * message only leaves the process in dev: in a build, what a stack says about the server is
 * nobody's business.
 */

import { HttpError, type Problem } from '../errors.js';
import { binWire } from '../wire/bin.js';
import { jsonWire } from '../wire/json.js';
import type { Wire } from '../wire/wire.js';

export const PROBLEM_TYPE = jsonWire.problemType;

export function problemOf(e: unknown, dev: boolean): Problem {
  if (e instanceof HttpError) return e.problem;
  const detail = e instanceof Error ? e.message : String(e);
  return { status: 500, title: 'Internal Server Error', ...(dev ? { detail } : {}) };
}

/**
 * The response of a failed call, in the function's format. A `Redirect` keeps its 3xx and its
 * `location` in the body, and carries no `Location` header on purpose: `fetch` would follow it,
 * and the caller would never see the `Redirect` it is owed.
 */
export function problemResponse(problem: Problem, wire: Wire = jsonWire): Response {
  return new Response(wire.encodeProblem(problem) as BodyInit, {
    status: problem.status,
    headers: { 'content-type': wire.problemType },
  });
}

/**
 * The 404 of a URL under `/_fudic/fn/` that names no function: it has no chain to read a format
 * from, so it answers in JSON to whoever accepts it, and in `fud-bin` to everyone else.
 */
export function noFunction(request: Request): Response {
  const json = (request.headers.get('accept') ?? '').includes(jsonWire.type);
  return problemResponse({ status: 404, title: 'Not Found', detail: 'no such server function' }, json ? jsonWire : binWire);
}
