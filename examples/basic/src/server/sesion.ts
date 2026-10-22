/** What `routes/sesion/[user].fudapi` declares, implemented. */

import { publish } from '@fudic/di';
import { load } from 'fudic:routes/sesion/[user]';
import { findUser } from '../data/users';
import { USER } from '../services/session';

load.handle(async (ctx) => {
  const name = await findUser(ctx.params.user);
  // Published for the browser to rebuild the same session from. Into the container of the
  // request being served, even after the `await`: it belongs to THIS response and to no other.
  publish(USER, name);
  return { name };
});
