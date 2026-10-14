import { middleware, type SharedMiddleware } from '@fudic/http';

/** Where each half ran, in order. One array for both sides: one module graph (§4.1). */
export const sides: string[] = [];

/** A middleware with its two halves. */
export const halves = middleware()
  .client((ctx, next) => {
    sides.push('halves:client');
    return next(ctx);
  })
  .server((ctx, next) => {
    sides.push('halves:server');
    return next(ctx);
  });

/** A plain function: it runs on both sides. */
export const plain: SharedMiddleware = (ctx, next) => {
  sides.push(`plain:${ctx.side}`);
  return next(ctx);
};
