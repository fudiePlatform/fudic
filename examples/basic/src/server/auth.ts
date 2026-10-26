/** The server half of `auth`: checks the token and leaves the user in `ctx`. */

import { inject } from '@fudic/di';
import { unauthorized } from '@fudic/http';
import { auth } from 'fudic:middlewares/auth';
import { Tokens } from '../services/tokens';

auth.server((ctx, next) => {
  const token = ctx.headers.get('authorization')?.slice('Bearer '.length);
  if (token === undefined || token === '') throw unauthorized('sin token');
  return next(Object.assign(ctx, { user: inject(Tokens).verify(token) }));
});
