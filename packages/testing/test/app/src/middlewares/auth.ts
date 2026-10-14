import { inject } from '@fudic/di';
import { middleware } from '@fudic/http';
import { Tokens } from '../data/tokens';

/** Two halves: the client half sends a token, the server half reads `Tokens`. */
export const auth = middleware<{ user: string }>()
  .client((ctx, next) => {
    ctx.headers.set('authorization', 'Bearer good');
    return next(ctx);
  })
  .server((ctx, next) => {
    const token = ctx.headers.get('authorization')?.slice('Bearer '.length) ?? '';
    return next(Object.assign(ctx, { user: inject(Tokens).verify(token) }));
  });
