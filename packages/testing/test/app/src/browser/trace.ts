import { halves, plain } from 'fudic:middlewares/trace';
import { sides } from '../data/sides';

halves.client((ctx, next) => {
  sides.push('halves:client');
  return next(ctx);
});

plain.client((ctx, next) => {
  sides.push(`plain:${ctx.side}`);
  return next(ctx);
});
