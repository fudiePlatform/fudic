/** What `routes/usuarios.fudapi` declares, implemented: every function reads `Users`. */

import { inject } from '@fudic/di';
import { crash, load, remove, save, search, searchJson, slowSearch } from 'fudic:routes/usuarios';
import { Users } from '../services/users';

load.handle(() => ({ users: inject(Users).all() }));

search.handle((ctx) => inject(Users).find(ctx.args.q));

searchJson.handle((ctx) => inject(Users).find(ctx.args.q));

slowSearch.handle((ctx) => inject(Users).find(ctx.args.q, 3000));

save.handle((ctx) => {
  inject(Users).setActive(ctx.args.id, ctx.args.active);
});

remove.handle((ctx) => {
  inject(Users).remove(ctx.args.id);
});

crash.handle(() => {
  throw new Error('fallo a propósito');
});
