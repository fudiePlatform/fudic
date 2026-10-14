/**
 * `@fudic/http`: server functions and the chain of middlewares both halves of a call walk
 * (SDD-56). What the developer writes in a `@server`, in `src/http.ts` and in a middleware's
 * module. The client stub lives in `./client`, the server dispatcher in `./server`.
 */

export type {
  AnyMiddleware,
  BaseContext,
  CallOptions,
  ClientContext,
  ClientStep,
  CompressOptions,
  Method,
  Middleware,
  Next,
  ServerContext,
  ServerFunction,
  ServerStep,
  SharedMiddleware,
} from './types.js';
export { get, post, put, patch, del, type FnBuilder, type ServerFn } from './builder.js';
export { chain, type ChainBuilder } from './chain.js';
export { middleware, type MiddlewareBuilder } from './middleware.js';
export {
  HttpError,
  ValidationError,
  Redirect,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  redirect,
  type Problem,
} from './errors.js';
export { csrf } from './csrf.js';
export { errorPages } from './error-pages.js';
