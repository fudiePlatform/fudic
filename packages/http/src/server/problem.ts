/**
 * An error, as the response that carries it (SDD-56 §4.6, step 6).
 *
 * An `HttpError` goes out with its status and its `Problem`. Anything else is a 500 whose
 * message only leaves the process in dev: in a build, what a stack says about the server is
 * nobody's business.
 */

import { HttpError, type Problem } from '../errors.js';

export const PROBLEM_TYPE = 'application/problem+json';

export function problemOf(e: unknown, dev: boolean): Problem {
  if (e instanceof HttpError) return e.problem;
  const detail = e instanceof Error ? e.message : String(e);
  return { status: 500, title: 'Internal Server Error', ...(dev ? { detail } : {}) };
}

/**
 * The response of a failed call. A `Redirect` keeps its 3xx and its `location` in the body,
 * and carries no `Location` header on purpose: `fetch` would follow it, and the caller would
 * never see the `Redirect` it is owed.
 */
export function problemResponse(problem: Problem): Response {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: { 'content-type': PROBLEM_TYPE },
  });
}
