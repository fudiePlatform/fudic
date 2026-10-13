/**
 * `middleware()`: a middleware with a client half, a server half, or both (SDD-56 §3.4).
 *
 * The halves are kept inside the instance, and only `halfOf` reads them: a `Middleware` is
 * opaque. In the client build the argument of every `.server(…)` is erased (§4.5), so in the
 * browser the server half is `undefined` and its code never arrives.
 */

import type { ClientStep, Middleware, ServerStep } from './types.js';

export interface MiddlewareBuilder<Adds extends object> extends Middleware<Adds> {
  client(step: ClientStep): MiddlewareBuilder<Adds>;
  server(step: ServerStep<Adds>): MiddlewareBuilder<Adds>;
}

/** A step of either side, as `run` calls it. */
export type AnyStep = (ctx: never, next: never) => unknown;

class Halves implements MiddlewareBuilder<object> {
  constructor(
    readonly c: ClientStep | undefined,
    readonly s: ServerStep<object> | undefined,
  ) {}

  client(step: ClientStep): MiddlewareBuilder<object> {
    return new Halves(step, this.s);
  }

  server(step: ServerStep<object>): MiddlewareBuilder<object> {
    return new Halves(this.c, step);
  }
}

export function middleware<Adds extends object = {}>(): MiddlewareBuilder<Adds> {
  return new Halves(undefined, undefined) as unknown as MiddlewareBuilder<Adds>;
}

/**
 * What a middleware runs on one side: a plain function runs on both, a built one its half, if
 * it has one.
 */
export function halfOf(mw: unknown, side: 'client' | 'server'): AnyStep | undefined {
  if (typeof mw === 'function') return mw as AnyStep;
  const halves = mw as Halves;
  return (side === 'client' ? halves.c : halves.s) as AnyStep | undefined;
}
