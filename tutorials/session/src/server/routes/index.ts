import { deleteCookie, setCookie } from '@fudic/http';
import { load, login, logout } from 'fudic:routes/index';

load.handle((ctx) => ({ user: ctx.cookies.get('session') ?? '' }));

login.handle((ctx) => {
  setCookie(ctx, 'session', ctx.args.user);
});

logout.handle((ctx) => {
  deleteCookie(ctx, 'session');
});
