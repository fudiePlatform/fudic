/** A server-only middleware: it has no client half, so in the browser it does nothing. */

import { middleware } from '@fudic/http';

export const audit = middleware().server(async (ctx, next) => {
  const result = await next(ctx);
  console.info(`[audit] ${ctx.method} ${ctx.name} ${JSON.stringify(ctx.args)}`);
  return result;
});
