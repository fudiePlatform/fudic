import { setCookie } from '@fudic/http';
import { login, secret } from 'fudic:routes/index';

login.handle((ctx) => {
  setCookie(ctx, 'session', ctx.args.user);
});

secret.handle((ctx) => `The code is 42, ${ctx.user}.`);
