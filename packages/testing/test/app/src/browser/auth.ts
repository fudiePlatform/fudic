import { auth } from 'fudic:middlewares/auth';

/** The client half of `auth`: it sends the token. */
auth.client((ctx, next) => {
  ctx.headers.set('authorization', 'Bearer good');
  return next(ctx);
});
