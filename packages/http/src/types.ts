/**
 * The contract both halves of a call share (SDD-56 §3.4).
 *
 * Types only. What runs lives next door: the pieces of `contract/`, the walk in `compose.ts`.
 */

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What both sides see. */
export interface BaseContext<A = unknown> {
  readonly side: 'client' | 'server';
  readonly method: Method;
  /** The exported name: `save`, or `load`. */
  readonly name: string;
  readonly url: URL;
  /** Mutable on the client (what is sent); the request's own on the server. */
  readonly headers: Headers;
  readonly args: A;
  readonly signal: AbortSignal;
}

export interface ClientContext<A = unknown> extends BaseContext<A> {
  readonly side: 'client';
}

export interface ServerContext<A = unknown> extends BaseContext<A> {
  readonly side: 'server';
  readonly params: Readonly<Record<string, string>>;
  readonly cookies: ReadonlyMap<string, string>;
  /** What the response carries besides the value: its status and headers (Set-Cookie…). */
  readonly response: { status: number; readonly headers: Headers };
}

export type Next<C> = (ctx: C) => Promise<unknown>;

/** The client half of a middleware. */
export type ClientStep = (ctx: ClientContext, next: Next<ClientContext>) => unknown;

/** The server half of a middleware that leaves `Adds` in `ctx` for whoever comes after it. */
export type ServerStep<Adds extends object = {}> = (
  ctx: ServerContext,
  next: Next<ServerContext & Adds>,
) => unknown;

export interface CompressOptions {
  readonly format: 'gzip' | 'deflate' | 'deflate-raw';
  /** Bytes of encoded body from which compression is attempted. Default: 1000. */
  readonly min?: number;
}

export interface CallOptions {
  /** The caller's own cancel. There is no timeout of any kind. */
  readonly signal?: AbortSignal;
  /** A route function's params. Default: the params of the page the browser is on. */
  readonly params?: Readonly<Record<string, string>>;
}

/** What the name of a server function is in the browser. */
export interface ServerFunction<A, R> {
  (...call: A extends void ? [args?: A, options?: CallOptions] : [args: A, options?: CallOptions]): Promise<R>;
  /**
   * Its verb. With it a server function is a `Callable` of `@fudic/core`, and `task` reads it
   * to pick its order, without either package importing the other.
   */
  readonly method: Method;
}
