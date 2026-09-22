/**
 * Entry of the `forms/form` piece (SDD-45 §4.3, third rule): the form, and the group that is
 * a form with no values of its own.
 *
 * `group` had its own piece for one build and the bench said no: a hundred compressed bytes
 * paying a frontier of a hundred and fifty plus a request. And it is not even optional in the
 * way a frontier needs — `group.ts` is one call into `form.ts`, so nobody downloads the group
 * without downloading the form, and apart they were never two choices, only two requests. A
 * schema with no groups now carries sixty bytes it does not use, which is less than the
 * frontier it stops paying.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export { form } from '../src/form.js';
export { group } from '../src/group.js';
