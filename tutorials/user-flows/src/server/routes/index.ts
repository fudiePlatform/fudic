import { setCookie } from '@fudic/http';
import { login } from 'fudic:routes/index';

login.handle((ctx) => {
  setCookie(ctx, 'session', ctx.args.user);
});
