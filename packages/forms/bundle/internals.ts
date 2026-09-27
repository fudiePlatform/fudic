/**
 * Entry of the `forms/internals` piece: what `control` and `form` both reach and neither owns.
 *
 * `internals.ts` was this piece alone. BUG-42 gave the two model pieces three more modules in
 * common — the validity policy, the `validateOn` policy beside it, and the record of which
 * asynchronous rules have answered — and the second rule of §4.3 says a module reached from two
 * pieces is a frontier. Three frontiers of a few dozen bytes each would lose money, so they
 * travel here: nobody downloads `control` or `form` without this piece, and the binders that
 * read `ValidateOn` sit on a page that already has the model.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export * from '../src/internals.js';
export * from '../src/validate-on.js';
export * from '../src/validity.js';
export * from '../src/verdicts.js';
