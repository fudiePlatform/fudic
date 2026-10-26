/** `audit`, after the function: what was called and with what. */

import { audit } from 'fudic:middlewares/audit';

audit.server(async (ctx, next) => {
  const result = await next(ctx);
  console.info(`[audit] ${ctx.method} ${ctx.name} ${JSON.stringify(ctx.args)}`);
  return result;
});
