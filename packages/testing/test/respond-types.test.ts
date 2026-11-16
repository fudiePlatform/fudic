/**
 * `respond` and `respondProblem` take ANY server function, whatever its arguments. The tests of
 * `test/app` cannot say so: their functions come from `fudic:*`, typed by the `.fudic/api` the
 * plugin writes when the tests start, after `tsc` has run. These are typed by hand, so `tsc` holds
 * them — and before the fix, a route's function with a required argument did not compile here.
 *
 * The calls live in functions nobody runs: what is asserted is that they compile.
 */

import { expect, test } from 'vitest';
import type { Problem, ServerFunction } from '@fudic/http';
import type { Contract, Linkable } from '@fudic/http/contract';
import { respond, respondProblem } from '../src/index.js';

// The shape `.fudic/api` gives a route's function: a `Contract` that also has a `url`.
declare const search: Contract<unknown, readonly string[], { readonly q: string }> & Linkable<{ readonly q: string }>;
declare const ping: ServerFunction<void, string>;
const problem: Problem = { status: 422, title: 'Unprocessable Content' };

test('any server function, with a required argument or without one', () => {
  const compiles = (): Response[] => [
    respondProblem(search, problem),
    respond(search, ['ana']),
    respondProblem(ping, problem),
    respond(ping, 'pong'),
  ];
  expect(compiles).toBeTypeOf('function');
});

test('the value is the function’s own', () => {
  const refused = (): Response =>
    // @ts-expect-error a number is not what `search` returns
    respond(search, 1);
  expect(refused).toBeTypeOf('function');
});
