/**
 * SDD-56 §3.5 in the type system — how the browser calls the name of a function — and the public
 * surface of the package entry: since SDD-60 §3.10, the errors and the types of `ctx`, and
 * nothing that builds a function, a chain or a middleware (a `.fudapi` declares them).
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import * as http from '../src/index.js';
import type { ServerFunction } from '../src/index.js';

interface User {
  readonly id: number;
  readonly name: string;
}

describe('ServerFunction: the name in the browser (§3.5)', () => {
  it('takes its args and options, and resolves to R', () => {
    type Search = ServerFunction<{ q: string }, User[]>;
    expectTypeOf<Search>().parameter(0).toEqualTypeOf<{ q: string }>();
    expectTypeOf<ReturnType<Search>>().toEqualTypeOf<Promise<User[]>>();
    // @ts-expect-error — `q` is a string.
    ((_: Search) => _({ q: 1 })) satisfies unknown;
    // @ts-expect-error — the args are required.
    ((_: Search) => _()) satisfies unknown;
  });

  it('with A = void it is called with no arguments', () => {
    type List = ServerFunction<void, number>;
    ((_: List) => _()) satisfies unknown;
    ((_: List) => _(undefined, { signal: new AbortController().signal })) satisfies unknown;
  });
});

describe('error-pages and _error.fud in the type system (BUG-51)', () => {
  it('the routes go by status, to a URL', () => {
    expectTypeOf<{ 401: '/login'; 403: '/login' }>().toMatchTypeOf<http.ErrorRoutes>();
    // @ts-expect-error — a route says where to go: a URL, not a number.
    expectTypeOf<{ 401: 1 }>().toMatchTypeOf<http.ErrorRoutes>();
  });

  it('ErrorPage is what _error.fud paints: status, title and maybe a detail', () => {
    expectTypeOf<http.ErrorPage>().toEqualTypeOf<{
      readonly status: number;
      readonly title: string;
      readonly detail?: string;
    }>();
  });
});

describe('the package entry', () => {
  it('exports what a handler throws, and nothing that builds a function (SDD-60 §3.10)', () => {
    expect(Object.keys(http).sort()).toEqual(
      [
        'HttpError',
        'Redirect',
        'ValidationError',
        'badRequest',
        'conflict',
        'forbidden',
        'notFound',
        'redirect',
        'unauthorized',
      ].sort(),
    );
  });
});
