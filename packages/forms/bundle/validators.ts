/**
 * Entry of the `forms/validators` piece (SDD-45 §4.3, third rule): the eight validators of
 * this package in ONE piece, because apart they lose money.
 *
 * They are alternatives to each other and they are tiny — between 50 and 130 bytes once
 * minified — while a frontier costs about 150 compressed bytes plus a request that has to be
 * made, queued and cached. Eight separate pieces mean the page that uses `required` alone pays
 * a frontier for a hundred bytes of content, and the page with three rules pays three. One
 * piece and everybody pays one.
 *
 * This is the correction the third rule exists for, and the first split got it exactly
 * backwards: `minLength` had a piece and `required` had none — not by any reasoning, but
 * because `examples/basic` happens to use one and not the other. Optional is not enough to
 * earn a frontier; a piece also has to be worth more than one.
 *
 * `length.ts` travels inside, unnamed: it is what `minLength` and `maxLength` share, both of
 * them are here, and a module reached from one piece is not a frontier.
 *
 * It lives beside `src` and not inside it because it is an ARTEFACT of the build, not a module
 * of the package: `dist` must not grow a second name for the same values, and `src/**` is the
 * denominator of this package's coverage.
 */

export { validator } from '../src/validators/validator.js';
export { serverValidator } from '../src/validators/server.js';
export { required } from '../src/validators/required.js';
export { minLength } from '../src/validators/min-length.js';
export { maxLength } from '../src/validators/max-length.js';
export { min } from '../src/validators/min.js';
export { max } from '../src/validators/max.js';
export { pattern } from '../src/validators/pattern.js';
