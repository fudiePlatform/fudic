/** The server half of `log`: the work of the function, timed. */

import { log } from 'fudic:middlewares/log';

log.server(async (ctx, next) => {
  const start = performance.now();
  try {
    return await next(ctx);
  } finally {
    console.info(`[${ctx.side}] ${ctx.method} ${ctx.name} ${String(Math.round(performance.now() - start))} ms`);
  }
});
