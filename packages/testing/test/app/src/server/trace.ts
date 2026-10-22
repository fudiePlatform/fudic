import { halves, plain } from 'fudic:middlewares/trace';
import { sides } from '../data/sides';

halves.server((ctx, next) => {
  sides.push('halves:server');
  return next(ctx);
});

plain.server((ctx, next) => {
  sides.push(`plain:${ctx.side}`);
  return next(ctx);
});
