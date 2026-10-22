/** The client half of `auth`: the token this browser keeps, on every call that uses it. */

import { auth } from 'fudic:middlewares/auth';

/** Where the page keeps the token. A demo: a real app would not use `localStorage`. */
export const TOKEN_KEY = 'fudic-token';

auth.client((ctx, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token !== null) ctx.headers.set('authorization', `Bearer ${token}`);
  return next(ctx);
});
