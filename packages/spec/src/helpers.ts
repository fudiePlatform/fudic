/**
 * The helpers a fixture is written with. Each answers a plain object — the markers of
 * `fixture-types.ts` — and none a promise: what a fixture holds is data.
 */

import type { Failed, FileAnswer, Later, Redirected } from '@fudic/http/contract';

/** A failure with an HTTP status and title; status `0` is a network failure. */
export function fails(status: number, title: string): Failed;
/** A failure by one of the codes the function's `fails` declares. */
export function fails<const C extends string>(code: C): Failed<C>;
export function fails(statusOrCode: number | string, title?: string): Failed<string> {
  return typeof statusOrCode === 'number'
    ? { $fails: { status: statusOrCode, title: title as string } }
    : { $fails: { code: statusOrCode } };
}

/** A redirect to `location`; `303` unless said otherwise. */
export function redirects(location: string, status = 303): Redirected {
  return { $redirects: location, status };
}

/** A file beside the fixture, as the answer of a `-> file` function. */
export function file(path: string, options: { readonly type?: string; readonly name?: string } = {}): FileAnswer {
  return { $file: path, ...options };
}

/** The value after `ms` milliseconds of the criterion's clock. */
function laterValue<T>(ms: number, value: T): Later<T> {
  return { $later: ms, value };
}

/** An answer that never arrives. */
function never(): Later<never> {
  return { $later: 'never' };
}

/** A failure after `ms` milliseconds. */
function laterFails(ms: number, status: number, title: string): Later<never> {
  return { $later: ms, fails: { status, title } };
}

/** `later(ms, value)`, `later.never()`, `later.fails(ms, status, title)`. */
export const later: typeof laterValue & { readonly never: typeof never; readonly fails: typeof laterFails } = Object.assign(laterValue, {
  never,
  fails: laterFails,
});
