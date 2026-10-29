/** The server half of `auth`: reads the session cookie and leaves the user in `ctx`. */

import { inject } from '@fudic/di';
import { unauthorized } from '@fudic/http';
import { auth } from 'fudic:middlewares/auth';
import { SESSION_COOKIE, Sessions } from '../services/sessions';

auth.server((ctx, next) => {
  const session = ctx.cookies.get(SESSION_COOKIE);
  if (session === undefined || session === '') throw unauthorized('sin sesión');
  return next(Object.assign(ctx, { user: inject(Sessions).verify(session) }));
});
