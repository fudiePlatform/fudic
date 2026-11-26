import { unauthorized } from '@fudic/http';
import { auth } from 'fudic:middlewares/auth';

auth.server((ctx, next) => {
  const user = ctx.cookies.get('session');
  if (user === undefined) throw unauthorized('Sign in first.');
  return next(Object.assign(ctx, { user }));
});
