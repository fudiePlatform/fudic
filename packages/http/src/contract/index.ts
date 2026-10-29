/**
 * `@fudic/http/contract`: what the modules generated from a `.fudapi` import (SDD-60 §3.10).
 * Internal: the developer writes against what the generated module exports, never this. The
 * server half of serving lives in `./contract/server`, so the browser never loads it.
 */

export {
  fn,
  stub,
  pathOf,
  contractsOf,
  SIG_HEADER,
  type ArgRule,
  type Contract,
  type FnContext,
  type FnSpec,
  type FormContext,
  type Handler,
  type ServerContract,
} from './fn.js';
export { page, type BrowserLoadPiece, type PageContext, type PagePiece, type PageSpec } from './page.js';
export {
  compose,
  middleware,
  use,
  type AnyPiece,
  type ClientHalf,
  type Composed,
  type Level,
  type MiddlewarePiece,
  type MiddlewareSpec,
  type ServerHalf,
  type Step,
  type Use,
} from './middleware.js';
export { fails, titleOf } from './fails.js';
export { conform, conformAll, fromText, toText, type Primitive, type Ty } from './wire.js';
export { folderOf, inTurn, loadingFile, resetRegistry, setFolders, takeRefusal, type Side } from '@fudic/forms/contract';
export { HttpError } from '../errors.js';
// The halves of the built-in middlewares, for their implementations in `browser/` and `server/`.
export { csrfClient } from '../csrf-client.js';
export { csrfServer } from '../csrf-server.js';
export { errorPagesStep } from '../error-pages.js';
