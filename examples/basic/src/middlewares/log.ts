/**
 * A plain function is a middleware that runs on BOTH sides: in the browser's console it times
 * the whole call, in the server's the work of the function.
 */

import type { SharedMiddleware } from '@fudic/http';

export const log: SharedMiddleware = async (ctx, next) => {
  const start = performance.now();
  try {
    return await next(ctx);
  } finally {
    console.info(`[${ctx.side}] ${ctx.method} ${ctx.name} ${String(Math.round(performance.now() - start))} ms`);
  }
};
