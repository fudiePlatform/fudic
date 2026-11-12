/** What `routes/entrar.fudapi` declares: the session cookie, and the way to /cuenta. */

import { redirect, setCookie } from '@fudic/http';
import { entrar } from 'fudic:routes/entrar';
import { SESSION_COOKIE } from '../services/sessions';

entrar.handle((ctx) => {
  // The cookie goes with the redirect: a failure keeps the headers the handler set.
  setCookie(ctx, SESSION_COOKIE, ctx.form.$value().user.trim().toLowerCase());
  throw redirect('/cuenta');
});
