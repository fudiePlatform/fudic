import { subscribe } from 'fudic:routes/index';

let next = 1;

subscribe.handle((ctx) => {
  const { email } = ctx.form.$value();
  if (email.endsWith('@example.org')) throw new Error('the mail server is down');
  return { id: next++, email };
});
