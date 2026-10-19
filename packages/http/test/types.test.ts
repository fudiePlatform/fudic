/**
 * SDD-56 §3.1, §3.4, §3.5 in the type system: what each `.use` leaves in `ctx`, what `.form`
 * adds, what `.args` declares, and how the browser calls the name. Plus the public surface of
 * the package entry.
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { control, form } from '@fudic/forms';
import * as http from '../src/index.js';
import { get, middleware, put, type ServerContext, type ServerFunction } from '../src/index.js';
import type { ServerFn } from '../src/builder.js';

interface User {
  readonly id: number;
  readonly name: string;
}

const auth = middleware<{ user: User }>().server(async (ctx, next) =>
  next(Object.assign(ctx, { user: { id: 1, name: 'Ana' } })),
);
const tenant = middleware<{ tenant: string }>();
const log = (ctx: unknown, next: (c: never) => Promise<unknown>) => next(ctx as never);

const userForm = form({ name: control(''), email: control('') });

describe('what .use leaves in ctx (criterion 40, in the core)', () => {
  it('after .use(auth), ctx.user is User', () => {
    put().use(auth).handle((ctx) => {
      expectTypeOf(ctx.user).toEqualTypeOf<User>();
    });
  });

  it('without .use(auth), ctx.user does not exist', () => {
    put().handle((ctx) => {
      expectTypeOf(ctx).not.toHaveProperty('user');
    });
  });

  it('several middlewares add up, and a plain function adds nothing', () => {
    put().use(auth, log, tenant).handle((ctx) => {
      expectTypeOf(ctx.user).toEqualTypeOf<User>();
      expectTypeOf(ctx.tenant).toEqualTypeOf<string>();
    });
    put().use(auth).use(tenant).handle((ctx) => {
      expectTypeOf(ctx.user).toEqualTypeOf<User>();
      expectTypeOf(ctx.tenant).toEqualTypeOf<string>();
    });
  });

  it('skip does not widen nor narrow the type', () => {
    put().use(auth).skip(log).skip('*').handle((ctx) => {
      expectTypeOf(ctx.user).toEqualTypeOf<User>();
    });
  });

  it('ctx in handle is a ServerContext', () => {
    put().handle((ctx) => {
      expectTypeOf(ctx).toMatchTypeOf<ServerContext>();
      expectTypeOf(ctx.side).toEqualTypeOf<'server'>();
    });
  });
});

describe('.form and .args', () => {
  it('after .form(f), ctx.form is the type of f and ctx.args too', () => {
    put().form(userForm).handle((ctx) => {
      expectTypeOf(ctx.form).toEqualTypeOf<typeof userForm>();
      expectTypeOf(ctx.args).toEqualTypeOf<typeof userForm>();
    });
  });

  it('without .form, ctx.form does not exist', () => {
    put().handle((ctx) => {
      expectTypeOf(ctx).not.toHaveProperty('form');
    });
  });

  it('.args<T>() types ctx.args; without it, it is void', () => {
    get().args<{ q: string }>().handle((ctx) => {
      expectTypeOf(ctx.args).toEqualTypeOf<{ q: string }>();
    });
    get().handle((ctx) => {
      expectTypeOf(ctx.args).toEqualTypeOf<void>();
    });
  });

  it('.handle gives a ServerFn of the args and the awaited result', () => {
    const search = get().args<{ q: string }>().handle(async () => [] as User[]);
    expectTypeOf(search).toEqualTypeOf<ServerFn<{ q: string }, User[]>>();
  });

  it('.form keeps the form at runtime, and does not share it across builders', () => {
    const base = put();
    const withForm = base.form(userForm).handle(() => {});
    expect(withForm.form).toBe(userForm);
    expect('form' in base.handle(() => {})).toBe(false);
  });
});

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

describe('errorPages and _error.fud in the type system (BUG-51)', () => {
  it('a route is a URL or a function of the error; the routes go by status', () => {
    expectTypeOf<'/login'>().toMatchTypeOf<http.ErrorRoute>();
    expectTypeOf<(e: http.HttpError) => string>().toMatchTypeOf<http.ErrorRoute>();
    expectTypeOf<{ 401: '/login'; 403: (e: http.HttpError) => string }>().toMatchTypeOf<http.ErrorRoutes>();
    // @ts-expect-error — a route says where to go: a URL, not a number.
    http.errorPages({ 401: 1 });
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
  it('exports what a developer writes, and nothing internal', () => {
    expect(Object.keys(http).sort()).toEqual(
      [
        'HttpError',
        'Redirect',
        'ValidationError',
        'badRequest',
        'chain',
        'conflict',
        'csrf',
        'del',
        'errorPages',
        'forbidden',
        'get',
        'middleware',
        'notFound',
        'patch',
        'post',
        'put',
        'redirect',
        'unauthorized',
      ].sort(),
    );
  });
});
