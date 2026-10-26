/**
 * `@fudic/http`: what the developer's handlers throw and the types of the `ctx` they receive
 * (SDD-56, SDD-60 §3.10). The functions, the chains and the middlewares are declared in a
 * `.fudapi`, and what fudic generates of it builds them through `./contract`.
 */

export type {
  BaseContext,
  CallOptions,
  ClientContext,
  ClientStep,
  CompressOptions,
  Method,
  Next,
  ServerContext,
  ServerFunction,
  ServerStep,
} from './types.js';
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
  type ErrorPage,
  type Problem,
} from './errors.js';
export type { ErrorRoutes } from './error-pages.js';
