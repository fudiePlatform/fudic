/**
 * Entry of the `http/contract` piece (BUG-57): what a page that calls its server needs, in one
 * file. The stubs a `.fudapi` generates for the browser, `page` and its `load.fetch`, the client
 * halves of the middlewares, the errors a handler throws and a caller catches, the type
 * descriptors and the binary format — which is the format of almost every function, so it
 * travels here and not as a piece of its own.
 *
 * Only what a browser runs: `@fudic/http/contract` also exports `csrfServer`, the server half of
 * a middleware, and that stays out. The forms registry it re-exports is re-exported here by the
 * URL of `forms/contract`, never copied: a second registry is one the implementations never
 * fill.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export { fn, stub, pathOf, contractsOf, SIG_HEADER } from '../src/contract/fn.js';
export { page } from '../src/contract/page.js';
export { compose, middleware, use } from '../src/contract/middleware.js';
export { fails, titleOf } from '../src/contract/fails.js';
export { conform, conformAll, fromText, toText } from '../src/contract/wire.js';
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
} from '../src/errors.js';
export { csrfClient } from '../src/csrf-client.js';
export { errorPagesStep } from '../src/error-pages.js';
export { formTypes, tyOfSchema } from '../src/wire/schema.js';
export { binWire, BIN_TYPE, BIN_PROBLEM_TYPE } from '../src/wire/bin.js';
export { STAGES } from '../src/client/stages/index.js';
// The forms registry `@fudic/http/contract` re-exports, by the URL of the piece that owns it.
export { folderOf, inTurn, loadingFile, resetRegistry, setFolders, takeRefusal } from '@fudic/forms/contract';
