/**
 * What comes back from a call, as a value or as the error it was on the server (SDD-56 §4.7,
 * step 4; SDD-67 §4.1, step 5). Both are read with the function's own format; a problem in JSON
 * is read too, without its codec, since a URL that names no function answers in JSON to whoever
 * asks for it.
 */

import { HttpError, Redirect, ValidationError, type Problem } from '../errors.js';
import type { Ty } from '../wire/ty.js';
import type { Wire } from '../wire/wire.js';

/** What `decode` needs of a function. */
export interface Returns {
  readonly wire: Wire;
  readonly returns?: Ty;
}

const JSON_PROBLEM = 'application/problem+json';

/** The same class the server threw, rebuilt from the `Problem` it sent. */
export function fromProblem(problem: Problem): HttpError {
  if (problem.status === 422) return new ValidationError(problem);
  if (problem.location !== undefined && problem.status >= 300 && problem.status < 400) {
    return new Redirect({ ...problem, location: problem.location });
  }
  return new HttpError(problem);
}

const bytesOf = async (response: Response): Promise<Uint8Array> => new Uint8Array(await response.arrayBuffer());

/** A 2xx is the value (`undefined` for a 204 or a function without `->`); anything else is thrown. */
export async function decode(response: Response, spec: Returns): Promise<unknown> {
  if (response.ok) {
    if (response.status === 204 || spec.returns === undefined) return undefined;
    return spec.wire.decodeValue(spec.returns, await bytesOf(response));
  }
  throw fromProblem(await problemOf(response, spec.wire));
}

/** The body of a failed response by its type, or a `Problem` made of its status when it is neither. */
async function problemOf(response: Response, wire: Wire): Promise<Problem> {
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
  try {
    if (type === wire.problemType) return wire.decodeProblem(await bytesOf(response));
    if (type === JSON_PROBLEM) return (await response.json()) as Problem;
  } catch {
    // A body that says it is a problem and is not one: as if it carried nothing.
  }
  return { status: response.status, title: response.statusText };
}
