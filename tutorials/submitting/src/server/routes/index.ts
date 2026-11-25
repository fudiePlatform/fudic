import { subscribe } from 'fudic:routes/index';

subscribe.handle((ctx) => {
  const { email } = ctx.form.$value();
  console.log(`[subscribe] ${email}`);
});
