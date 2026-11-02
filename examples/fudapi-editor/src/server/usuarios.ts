// The handlers of routes/usuarios.fudapi. Save the .fudapi and these types follow it.
import { load, remove, save, SaveFails, search, type SearchHandler } from 'fudic:routes/usuarios';

const people = [{ id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', name: 'Ada', active: true, role: 'admin' as const }];

export const buscar = ((ctx) => people.filter((p) => p.name.includes(ctx.args.q))) satisfies SearchHandler;

load.handle(() => ({ users: people }));
search.handle(buscar);
save.handle((ctx) => {
  // `ctx.user` is what `auth` adds; `ctx.params.id`, `ctx.query.notify` and `ctx.args.active` are typed.
  if (ctx.user.roles.length === 0) throw SaveFails.locked();
  void ctx.params.id;
  void ctx.query.notify;
  void ctx.args.active;
});
remove.handle(() => {});
