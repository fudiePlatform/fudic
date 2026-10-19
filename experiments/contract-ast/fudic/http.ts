/**
 * Stub of the slice of `@fudic/http` a middleware file uses. In a polyglot app the TS file of a
 * middleware keeps its client half and what it adds to `ctx`; the server half is native.
 */

export interface ClientContext {
  readonly headers: Headers;
}
export type Next<C> = (ctx: C) => Promise<unknown>;
export type ClientStep = (ctx: ClientContext, next: Next<ClientContext>) => unknown;

export interface Middleware<Adds extends object = {}> {
  readonly '~adds'?: Adds;
  client(step: ClientStep): Middleware<Adds>;
}

export declare function middleware<Adds extends object = {}>(): Middleware<Adds>;

/** A plain function on both sides: what IDEA-05 §11.5 says cannot exist with another backend. */
export type SharedMiddleware = (ctx: ClientContext, next: Next<ClientContext>) => unknown;
