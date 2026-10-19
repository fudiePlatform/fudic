/**
 * The client half of `auth` and what it leaves in `ctx`. Its server half (check the token,
 * find the user) is written in the backend's language, against the interface generated from
 * this file. It lives apart because every `server.ts` that needs it shares it.
 */

import type { i32 } from "@fudic/contract";
import { middleware } from "@fudic/http";

export const TOKEN_KEY = "fudic-token";

export const auth = middleware<{ user: { id: i32; name: string } }>().client((ctx, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token !== null) ctx.headers.set("authorization", `Bearer ${token}`);
  return next(ctx);
});
