/** The client half of `log`: the whole call, timed in the browser's console. */

import { log } from 'fudic:middlewares/log';

log.client(async (ctx, next) => {
  const start = performance.now();
  try {
    return await next(ctx);
  } finally {
    console.info(`[${ctx.side}] ${ctx.method} ${ctx.name} ${String(Math.round(performance.now() - start))} ms`);
  }
});
