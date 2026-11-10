/**
 * `@fudic/server`: a fudic app served from a `Request` to a `Response` (SDD-81 §3.10) — the
 * same in dev, in `vite preview` and behind any adapter. Nothing here imports Node; the glue to
 * `node:http` is `@fudic/server/node`.
 */

export { createServer, matchRoute } from './server.js';
export type {
  AppRoute,
  EarlyHints,
  ErrorPage,
  FetchHooks,
  FudicServer,
  FunctionsOptions,
  Handler,
  ServerApp,
  ServerOptions,
} from './types.js';
export {
  drainStream,
  edgeContext,
  matchesPattern,
  openStream,
  pageData,
  paramsOf,
  renderPage,
  withRequest,
  type OpenedPage,
  type PendingResponse,
  type RenderModule,
} from './render.js';
export { pendingResponse, readsSession, type ServerSettings } from './response.js';
export {
  backOf,
  classifyError,
  ERROR_PATTERN,
  minimalErrorPage,
  PAGE_REFERRER_POLICY,
  pageOriginOf,
  problemOfStatus,
  renderErrorPage,
  withoutBase,
  type PageError,
  type PageOrigin,
  type PageProblem,
} from './errors.js';
export { errorLocaleOf, localeOfPath, localeRedirect, negotiate, prefixPattern, withoutLocalePrefix } from './locale.js';
export { forwardedOrigin, publicRequest } from './proxy.js';
