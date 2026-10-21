// WRITTEN BY THE DEVELOPER. The two halves of `middleware auth`, as examples/basic writes them.
// The server half only exists when the backend is TS; with C# or Java it is AuthMiddleware there.

import { inject } from '@fudic/di';
import { unauthorized } from '@fudic/http';
import type { AuthClient, AuthServer } from '../generated/shared';
import { Tokens } from '../services/tokens';

export const TOKEN_KEY = 'fudic-token';

export const client = ((ctx, next) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token !== null) ctx.headers.set('authorization', `Bearer ${token}`);
  return next(ctx);
}) satisfies AuthClient;

export const server = ((ctx, next) => {
  const token = ctx.headers.get('authorization')?.slice('Bearer '.length);
  if (token === undefined || token === '') throw unauthorized('sin token');
  return next(Object.assign(ctx, { user: inject(Tokens).verify(token) }));
}) satisfies AuthServer;
