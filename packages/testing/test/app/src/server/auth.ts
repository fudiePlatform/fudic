import { inject } from '@fudic/di';
import { auth } from 'fudic:middlewares/auth';
import { Tokens } from '../data/tokens';

/** The server half of `auth`: it reads `Tokens`, which never reaches the browser. */
auth.server((ctx, next) => {
  const token = ctx.headers.get('authorization')?.slice('Bearer '.length) ?? '';
  return next(Object.assign(ctx, { user: inject(Tokens).verify(token) }));
});
