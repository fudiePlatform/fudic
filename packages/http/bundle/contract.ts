/**
 * Entry of the `http/contract` piece (BUG-57): what a page that calls its server needs, in one
 * file. The stubs a `.fudapi` generates for the browser, `page` and its `load.fetch`, the client
 * halves of the middlewares, the errors a handler throws and a caller catches, the type
 * descriptors.
 *
 * Four things travel apart, each because a page that does not use it must not download it
 * (BUG-62): the binary format (`http/bin`, with the reader of the data frames), the files of a
 * call (`http/files`, handed to `stub` only by a function that carries them), JSON (`http/json`,
 * only with `use json`) and the forms registry the browser root takes (`http/registry`).
 * Splitting further was measured and does not pay: the pieces a page always loads together
 * compress worse apart, and each one more is one more request.
 *
 * Only what a browser runs: `@fudic/http/contract` also exports `fn`, `contractsOf` and
 * `csrfServer`, the server side of a function and of a middleware, and they stay out.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export { stub, pathOf, SIG_HEADER } from '../src/contract/fn.js';
export { page } from '../src/contract/page.js';
// The door a `runs remote` rule asks through: the client halves of its chain (SDD-80).
export { ruleSend } from '../src/contract/rule-send.js';
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
export { STAGES } from '../src/client/stages/index.js';

// What `http/bin`, `http/files` and `http/json` take from this piece, by its URL: never copied into it.
export { fileOf } from '../src/contract/wire.js';
export { CODE_HEADER } from '../src/errors.js';
export { counted } from '../src/client/send.js';
