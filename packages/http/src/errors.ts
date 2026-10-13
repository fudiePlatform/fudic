/**
 * Errors are exceptions, on both sides (SDD-56 §3.6). The server throws one and answers with
 * its `Problem`; the client reads that `Problem` back and throws the same class again.
 */

import type { ErrorMap, Errors } from '@fudic/forms';

/** The problem body (RFC 9457) a failed call carries. */
export interface Problem {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly errors?: ErrorMap | null;
  readonly summary?: Errors | null;
  readonly location?: string;
}

export class HttpError extends Error {
  override readonly name: string = 'HttpError';
  readonly status: number;
  /** The problem body (RFC 9457) as it came from the server, or as it will go. */
  readonly problem: Problem;

  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.status = problem.status;
    this.problem = problem;
  }
}

/** 422: the form did not validate on the server. Its errors belong to the form. */
export class ValidationError extends HttpError {
  override readonly name: string = 'ValidationError';
  readonly errors: ErrorMap | null;
  readonly summary: Errors | null;

  constructor(problem: Problem) {
    super(problem);
    this.errors = problem.errors ?? null;
    this.summary = problem.summary ?? null;
  }
}

/** 3xx: go somewhere else. */
export class Redirect extends HttpError {
  override readonly name: string = 'Redirect';
  readonly location: string;

  constructor(problem: Problem & { readonly location: string }) {
    super(problem);
    this.location = problem.location;
  }
}

/** One factory per status, so a call site reads as what happened. */
const make =
  (status: number, title: string) =>
  (detail?: string): HttpError =>
    new HttpError({ status, title, ...(detail !== undefined ? { detail } : {}) });

export const badRequest = /*#__PURE__*/ make(400, 'Bad Request');
export const unauthorized = /*#__PURE__*/ make(401, 'Unauthorized');
export const forbidden = /*#__PURE__*/ make(403, 'Forbidden');
export const notFound = /*#__PURE__*/ make(404, 'Not Found');
export const conflict = /*#__PURE__*/ make(409, 'Conflict');

const REDIRECTS = {
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
} as const;

export function redirect(location: string, status: keyof typeof REDIRECTS = 303): Redirect {
  return new Redirect({ status, title: REDIRECTS[status], location });
}
