import { signup } from 'fudic:routes/index';
import { addUser } from '../users';

signup.handle(async (ctx) => {
  await addUser(ctx.form.$value().alias);
});
