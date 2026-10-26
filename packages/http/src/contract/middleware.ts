/**
 * A `middleware` of a `.fudapi` (SDD-60 §3.8) and the chain its uses make (§3.5).
 *
 * The piece holds a slot per half it declares; `.client(fn)` and `.server(fn)` fill them from
 * `src/browser` and `src/server`. A chain names pieces, never functions, so the implementation
 * is read when the step runs: the folders load after the generated modules.
 *
 * A declared half without an implementation fails the call: a missing `auth` must never let
 * the request through.
 */

import { Slot } from '@fudic/forms/contract';
import type { ClientContext, CompressOptions, Next, ServerContext } from '../types.js';

/** The client half, with the parameters of the `use` that put it in the chain. */
export type ClientHalf<P = {}> = (ctx: ClientContext, next: Next<ClientContext>, params: P) => unknown;

/** The server half: `Adds` is what it leaves in `ctx` for whoever comes after it. */
export type ServerHalf<P = {}, Adds extends object = {}> = (
  ctx: ServerContext,
  next: Next<ServerContext & Adds>,
  params: P,
) => unknown;

export interface MiddlewareSpec {
  readonly id: string;
  /** As written: `error-pages`. */
  readonly name: string;
  readonly client?: boolean;
  readonly server?: boolean;
  /** The browser variant: its server half can have no implementation here. */
  readonly browser?: boolean;
}

export interface MiddlewarePiece<P = {}, Adds extends object = {}> {
  readonly name: string;
  client(fn: ClientHalf<P>): void;
  server(fn: ServerHalf<P, Adds>): void;
  /** Phantom: what it leaves in `ctx`. */
  readonly '~adds'?: Adds;
}

type AnyHalf = (ctx: never, next: never, params: never) => unknown;

interface Halves {
  readonly client?: Slot<AnyHalf>;
  readonly server?: Slot<AnyHalf>;
}

const halves = new WeakMap<object, Halves>();

export function middleware<P = {}, Adds extends object = {}>(spec: MiddlewareSpec): MiddlewarePiece<P, Adds> {
  const label = `${spec.name} of ${spec.id}`;
  const own: Halves = {
    ...(spec.client === true ? { client: new Slot<AnyHalf>(`the client half of ${label}`, 'browser') } : {}),
    ...(spec.server === true ? { server: new Slot<AnyHalf>(`the server half of ${label}`, 'server', spec.browser === true) } : {}),
  };
  const fill = (slot: Slot<AnyHalf> | undefined, side: string, fn: AnyHalf): void => {
    if (slot === undefined) throw new Error(`${label} has no ${side} half`);
    slot.set(fn);
  };
  const piece: MiddlewarePiece<P, Adds> = {
    name: spec.name,
    client: (fn) => fill(own.client, 'client', fn as AnyHalf),
    server: (fn) => fill(own.server, 'server', fn as AnyHalf),
  };
  halves.set(piece, own);
  return piece;
}

/** A middleware as a chain names it, whatever its parameters and what it adds. */
export interface AnyPiece {
  readonly name: string;
}

/** One middleware of a `use`, with the parameters written under it. */
export interface Use {
  readonly mw: AnyPiece;
  readonly params: object;
}

export const use = <P, A extends object>(mw: MiddlewarePiece<P, A>, params?: P): Use => ({
  mw,
  params: (params ?? {}) as object,
});

/** One clause of a level, in the order it was written. */
export type Step = { readonly use: readonly Use[] } | { readonly skip: readonly AnyPiece[] } | { readonly skip: '*' };

/** A level of the chain: the global `chain`, a file's, a function's or `load`'s own clauses. */
export interface Level {
  readonly steps: readonly Step[];
  /** Absent when the level writes no `compress`; `false` for `compress off`. */
  readonly compress?: CompressOptions | false;
}

export interface Composed {
  readonly steps: readonly ((ctx: never, next: never) => unknown)[];
  readonly compression: CompressOptions | false;
}

/** The levels folded from the outside in, and the halves of one side (SDD-56 §4.3). */
export function compose(levels: readonly Level[], side: 'client' | 'server'): Composed {
  let list: readonly Use[] = [];
  let compression: CompressOptions | false = false;
  for (const level of levels) {
    for (const step of level.steps) {
      if ('use' in step) list = [...list, ...step.use];
      else if (step.skip === '*') list = [];
      else {
        const gone = step.skip;
        list = list.filter((u) => !gone.includes(u.mw));
      }
    }
    if (level.compress !== undefined) compression = level.compress;
  }
  const steps: ((ctx: never, next: never) => unknown)[] = [];
  for (const { mw, params } of list) {
    const slot = halves.get(mw)![side];
    if (slot === undefined) continue;
    steps.push((ctx, next) => {
      const fn = slot.get();
      if (fn === undefined) throw new Error(slot.missing());
      return (fn as (c: never, n: never, p: object) => unknown)(ctx, next, params);
    });
  }
  return { steps, compression };
}
