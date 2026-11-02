/** What `routes/usuarios.fudapi` declares, implemented: every function reads `Users`. */

import { inject } from '@fudic/di';
import { deleteCookie, setCookie } from '@fudic/http';
import { crash, load, login, logout, remove, save, SaveFails, search, searchJson, slowSearch } from 'fudic:routes/usuarios';
import { SESSION_COOKIE } from '../services/sessions';
import { Users } from '../services/users';

load.handle((ctx) => {
  const session = ctx.cookies.get(SESSION_COOKIE);
  return { users: inject(Users).all(), ...(session !== undefined ? { session } : {}) };
});

login.handle((ctx) => {
  setCookie(ctx, SESSION_COOKIE, ctx.args.user);
});

logout.handle((ctx) => {
  deleteCookie(ctx, SESSION_COOKIE);
});

search.handle((ctx) => inject(Users).find(ctx.args.q));

searchJson.handle((ctx) => inject(Users).find(ctx.args.q));

slowSearch.handle((ctx) => inject(Users).find(ctx.args.q, 3000));

save.handle((ctx) => {
  // A 409 the function keeps (`catches 409`): the page paints the text of `ana` instead of going to
  // `_error.fud`. The server sends the code; the words are the .fudapi's, in the page's language.
  if (ctx.args.id === 1 && !ctx.args.active) throw SaveFails.ana();
  inject(Users).setActive(ctx.args.id, ctx.args.active);
});

remove.handle((ctx) => {
  inject(Users).remove(ctx.args.id);
});

crash.handle(() => {
  throw new Error('fallo a propósito');
});
