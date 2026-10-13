/**
 * A middleware with its two halves.
 *
 * The client half puts the token on the request; the server half checks it and leaves the
 * user in `ctx` for whoever comes after. The server half never reaches the browser: the build
 * erases its argument, and `Tokens` goes with it.
 */

import { inject } from '@fudic/di';
import { middleware, unauthorized } from '@fudic/http';
import { Tokens, type User } from '../services/tokens';

/** Where the page keeps the token. A demo: a real app would not use `localStorage`. */
export const TOKEN_KEY = 'fudic-token';

export const auth = middleware<{ user: User }>()
  .client((ctx, next) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token !== null) ctx.headers.set('authorization', `Bearer ${token}`);
    return next(ctx);
  })
  .server((ctx, next) => {
    const token = ctx.headers.get('authorization')?.slice('Bearer '.length);
    if (token === undefined || token === '') throw unauthorized('sin token');
    return next(Object.assign(ctx, { user: inject(Tokens).verify(token) }));
  });
