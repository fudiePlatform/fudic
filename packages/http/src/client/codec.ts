/**
 * What comes back from a call, as a value or as the error it was on the server (SDD-56 §4.7,
 * step 4).
 */

import { HttpError, Redirect, ValidationError, type Problem } from '../errors.js';

/** The same class the server threw, rebuilt from the `Problem` it sent. */
export function fromProblem(problem: Problem): HttpError {
  if (problem.status === 422) return new ValidationError(problem);
  if (problem.location !== undefined && problem.status >= 300 && problem.status < 400) {
    return new Redirect({ ...problem, location: problem.location });
  }
  return new HttpError(problem);
}

/** A 2xx is the value (`undefined` for a 204); anything else is thrown. */
export async function decode(response: Response): Promise<unknown> {
  if (response.ok) return response.status === 204 ? undefined : ((await response.json()) as unknown);
  throw fromProblem(await problemOf(response));
}

/** The body of a failed response, or a `Problem` made of its status when it carries none. */
async function problemOf(response: Response): Promise<Problem> {
  try {
    return (await response.json()) as Problem;
  } catch {
    return { status: response.status, title: response.statusText };
  }
}
