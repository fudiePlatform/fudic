import { publish } from '@fudic/di';
import { load } from 'fudic:routes/index';
import { USER } from '../../services/session.service';

load.handle(async (ctx) => {
  const user = ctx.url.searchParams.get('user') ?? 'guest';
  await new Promise((resolve) => setTimeout(resolve, 1000));
  publish(USER, user);
  return { user };
});
